import CoreImage
import PDFKit
import UIKit
import Vision

enum RedactionEngine {

    // MARK: - PII Detection

    private static let patterns: [(name: String, regex: String)] = [
        ("SSN", #"\b\d{3}-\d{2}-\d{4}\b"#),
        ("Email", #"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"#),
        ("CreditCard", #"\b(?:\d[ -]*?){13,19}\b"#),
        ("Phone", #"(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"#)
    ]

    static func detectPII(in page: PDFPage, completion: @escaping ([CGRect]) -> Void) {
        let pageBounds = page.bounds(for: .mediaBox)
        let scale: CGFloat = 2.0
        let renderSize = CGSize(width: pageBounds.width * scale, height: pageBounds.height * scale)

        guard let pageImage = renderPageImage(page: page, size: renderSize) else {
            completion([])
            return
        }

        guard let cgImage = pageImage.cgImage else {
            completion([])
            return
        }

        let request = VNRecognizeTextRequest { request, _ in
            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                DispatchQueue.main.async { completion([]) }
                return
            }

            var redactionRects: [CGRect] = []

                for observation in observations {
                    let text = observation.topCandidates(1).first?.string ?? ""
                    guard !text.isEmpty else { continue }

                    for (_, pattern) in patterns {
                        guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
                        let range = NSRange(text.startIndex..., in: text)
                        let matches = regex.matches(in: text, range: range)

                        for match in matches {
                            guard let matchRange = Range(match.range, in: text) else { continue }
                            let matchedText = String(text[matchRange])

                            if pattern.contains("CreditCard"), !isLikelyCreditCard(matchedText) {
                                continue
                            }

                            if let boxObservation = try? observation.boundingBox(for: matchRange) {
                                let imageRect = convertVisionBox(boxObservation.boundingBox, imageSize: renderSize)
                            let pdfRect = convertImageRectToPDFSpace(
                                imageRect: imageRect,
                                imageSize: renderSize,
                                pageBounds: pageBounds
                            )
                            let padded = pdfRect.insetBy(dx: -4, dy: -2)
                            redactionRects.append(padded)
                        }
                    }
                }
            }

            let merged = mergeOverlappingRects(redactionRects)
            DispatchQueue.main.async { completion(merged) }
        }

        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try handler.perform([request])
            } catch {
                DispatchQueue.main.async { completion([]) }
            }
        }
    }

    // MARK: - Burn & Flatten

    static func burnAndFlatten(pdfDocument: PDFDocument, redactions: [RedactionRect]) -> URL? {
        let pageCount = pdfDocument.pageCount
        guard pageCount > 0 else { return nil }

        let firstPage = pdfDocument.page(at: 0)!
        let pageRect = firstPage.bounds(for: .mediaBox)

        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [
            kCGPDFContextCreator as String: "RedactPDF",
            kCGPDFContextAuthor as String: "RedactPDF"
        ]

        let renderer = UIGraphicsPDFRenderer(bounds: pageRect, format: format)
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("RedactPDF_\(UUID().uuidString).pdf")

        let data = renderer.pdfData { context in
            for pageIndex in 0..<pageCount {
                guard let page = pdfDocument.page(at: pageIndex) else { continue }
                let bounds = page.bounds(for: .mediaBox)
                context.beginPage(withBounds: bounds, pageInfo: [:])

                guard let ctx = UIGraphicsGetCurrentContext() else { continue }

                ctx.saveGState()
                ctx.translateBy(x: 0, y: bounds.height)
                ctx.scaleBy(x: 1, y: -1)

                page.draw(with: .mediaBox, to: ctx)
                ctx.restoreGState()

                let pageRedactions = redactions.filter { $0.pageIndex == pageIndex }
                for redaction in pageRedactions {
                    applyRedaction(redaction, on: page, in: ctx, pageBounds: bounds)
                }
            }
        }

        do {
            try data.write(to: outputURL, options: .atomic)
            return outputURL
        } catch {
            return nil
        }
    }

    // MARK: - Private Helpers

    private static func renderPageImage(page: PDFPage, size: CGSize) -> UIImage? {
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            ctx.cgContext.translateBy(x: 0, y: size.height)
            ctx.cgContext.scaleBy(x: 1, y: -1)
            let scale = size.width / page.bounds(for: .mediaBox).width
            ctx.cgContext.scaleBy(x: scale, y: scale)
            page.draw(with: .mediaBox, to: ctx.cgContext)
        }
    }

    private static func convertVisionBox(_ box: CGRect, imageSize: CGSize) -> CGRect {
        CGRect(
            x: box.origin.x * imageSize.width,
            y: (1 - box.origin.y - box.height) * imageSize.height,
            width: box.width * imageSize.width,
            height: box.height * imageSize.height
        )
    }

    private static func convertImageRectToPDFSpace(
        imageRect: CGRect,
        imageSize: CGSize,
        pageBounds: CGRect
    ) -> CGRect {
        let scaleX = pageBounds.width / imageSize.width
        let scaleY = pageBounds.height / imageSize.height
        return CGRect(
            x: imageRect.origin.x * scaleX,
            y: pageRectYFlip(imageRect.origin.y, height: imageRect.height, pageHeight: pageBounds.height, scale: scaleY),
            width: imageRect.width * scaleX,
            height: imageRect.height * scaleY
        )
    }

    private static func pageRectYFlip(_ y: CGFloat, height: CGFloat, pageHeight: CGFloat, scale: CGFloat) -> CGFloat {
        pageHeight - (y * scale) - (height * scale)
    }

    private static func isLikelyCreditCard(_ text: String) -> Bool {
        let digits = text.filter(\.isNumber)
        guard digits.count >= 13, digits.count <= 19 else { return false }
        return luhnCheck(digits)
    }

    private static func luhnCheck(_ digits: String) -> Bool {
        var sum = 0
        let reversed = digits.reversed().map { Int(String($0)) ?? 0 }
        for (index, digit) in reversed.enumerated() {
            if index.isMultiple(of: 2) {
                sum += digit
            } else {
                let doubled = digit * 2
                sum += doubled > 9 ? doubled - 9 : doubled
            }
        }
        return sum % 10 == 0
    }

    private static func mergeOverlappingRects(_ rects: [CGRect]) -> [CGRect] {
        guard !rects.isEmpty else { return [] }
        var merged = rects
        var changed = true
        while changed {
            changed = false
            var result: [CGRect] = []
            var used = Set<Int>()
            for i in 0..<merged.count {
                if used.contains(i) { continue }
                var current = merged[i]
                for j in (i + 1)..<merged.count {
                    if used.contains(j) { continue }
                    if current.intersects(merged[j]) {
                        current = current.union(merged[j])
                        used.insert(j)
                        changed = true
                    }
                }
                result.append(current)
            }
            merged = result
        }
        return merged
    }

    private static func applyRedaction(
        _ redaction: RedactionRect,
        on page: PDFPage,
        in context: CGContext,
        pageBounds: CGRect
    ) {
        let rect = redaction.rect

        switch redaction.style {
        case .black:
            context.setFillColor(UIColor.black.cgColor)
            context.fill(rect)

        case .white:
            context.setFillColor(UIColor.white.cgColor)
            context.fill(rect)

        case .blur:
            guard let blurred = blurredRegion(from: page, rect: rect, pageBounds: pageBounds) else {
                context.setFillColor(UIColor.black.cgColor)
                context.fill(rect)
                return
            }
            blurred.draw(in: rect)
        }
    }

    private static func blurredRegion(from page: PDFPage, rect: CGRect, pageBounds: CGRect) -> UIImage? {
        let scale: CGFloat = 3.0
        let fullSize = CGSize(width: pageBounds.width * scale, height: pageBounds.height * scale)
        guard let fullImage = renderPageImage(page: page, size: fullSize),
              let cgImage = fullImage.cgImage else { return nil }

        let scaledRect = CGRect(
            x: rect.origin.x * scale,
            y: rect.origin.y * scale,
            width: rect.width * scale,
            height: rect.height * scale
        ).integral

        guard scaledRect.width > 0, scaledRect.height > 0,
              let cropped = cgImage.cropping(to: scaledRect) else { return nil }

        let ciImage = CIImage(cgImage: cropped)
        guard let filter = CIFilter(name: "CIGaussianBlur") else { return nil }
        filter.setValue(ciImage, forKey: kCIInputImageKey)
        filter.setValue(12.0, forKey: kCIInputRadiusKey)

        let ciContext = CIContext()
        guard let output = filter.outputImage,
              let blurredCG = ciContext.createCGImage(output, from: ciImage.extent) else { return nil }

        return UIImage(cgImage: blurredCG)
    }
}

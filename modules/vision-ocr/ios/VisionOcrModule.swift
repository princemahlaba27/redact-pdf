import ExpoModulesCore
import Foundation
import ImageIO
import NaturalLanguage
import PDFKit
import UIKit
import Vision

/// On-device OCR + entity detection + destructive page flatten.
/// No network. Vision origin is bottom-left; JS flips to UIKit top-left.
public class VisionOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionOcr")

    Function("isAvailable") { () -> Bool in
      true
    }

    AsyncFunction("recognizeText") { (uriString: String) -> [[String: Any]] in
      let fileURL = Self.fileURL(from: uriString)
      guard let cgImage = Self.loadCGImage(from: fileURL) else {
        throw Self.err("Could not load image at \(uriString)")
      }
      let page = try await Self.recognize(cgImage: cgImage)
      return page.tokens
    }

    /// PDF pages and raster images. Each page is rendered to a CGImage, then
    /// VNRecognizeTextRequest (.accurate, language correction) plus
    /// NSDataDetector / NLTagger / financial patterns.
    AsyncFunction("recognizeDocument") { (uriString: String) -> [String: Any] in
      let fileURL = Self.fileURL(from: uriString)
      let ext = fileURL.pathExtension.lowercased()
      if ext == "pdf" {
        return try await Self.recognizePdf(fileURL)
      }
      guard let cgImage = Self.loadCGImage(from: fileURL) else {
        throw Self.err("Could not load document at \(uriString)")
      }
      let page = try await Self.recognize(cgImage: cgImage)
      return [
        "pages": [[
          "pageIndex": 0,
          "tokens": page.tokens,
          "entities": page.entities,
        ]],
      ]
    }

    /// Rasterize every page and paint solid black boxes. The written PDF
    /// contains only images, so vector text and OCR streams are gone.
    AsyncFunction("flattenPdf") { (uriString: String, rects: [[String: Any]]) -> String in
      let fileURL = Self.fileURL(from: uriString)
      let boxes = Self.parseRects(rects)
      let ext = fileURL.pathExtension.lowercased()
      let images: [UIImage]
      if ext == "pdf" {
        images = try Self.flattenPdfPages(fileURL, boxes: boxes)
      } else {
        guard let cgImage = Self.loadCGImage(from: fileURL) else {
          throw Self.err("Could not load document at \(uriString)")
        }
        let base = UIImage(cgImage: cgImage)
        images = [Self.paint(image: base, boxes: boxes.filter { $0.page == 0 })]
      }
      return try Self.writeImagePdf(images)
    }
  }

  private struct PageScan {
    var tokens: [[String: Any]]
    var entities: [[String: Any]]
  }

  private struct FlatRect {
    var page: Int
    var x: CGFloat
    var y: CGFloat
    var width: CGFloat
    var height: CGFloat
  }

  private static func err(_ message: String) -> NSError {
    NSError(domain: "VisionOcr", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private static func fileURL(from uriString: String) -> URL {
    if uriString.hasPrefix("file://") {
      return URL(string: uriString) ?? URL(fileURLWithPath: uriString)
    }
    if uriString.hasPrefix("/") {
      return URL(fileURLWithPath: uriString)
    }
    return URL(string: uriString) ?? URL(fileURLWithPath: uriString)
  }

  private static func loadCGImage(from url: URL) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
  }

  private static func recognizePdf(_ url: URL) async throws -> [String: Any] {
    guard let doc = PDFDocument(url: url) else {
      throw err("Could not open PDF")
    }
    var pages: [[String: Any]] = []
    for index in 0..<doc.pageCount {
      guard let page = doc.page(at: index) else { continue }
      let rendered = render(page: page, boxes: [])
      guard let cgImage = rendered.cgImage else { continue }
      let scan = try await recognize(cgImage: cgImage)
      pages.append([
        "pageIndex": index,
        "tokens": scan.tokens,
        "entities": scan.entities,
      ])
    }
    return ["pages": pages]
  }

  private static func recognize(cgImage: CGImage) async throws -> PageScan {
    try await withCheckedThrowingContinuation { continuation in
      let request = VNRecognizeTextRequest { request, error in
        if let error = error {
          continuation.resume(throwing: error)
          return
        }
        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        continuation.resume(returning: scan(observations))
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      if #available(iOS 16.0, *) {
        request.automaticallyDetectsLanguage = true
      }
      let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
      do {
        try handler.perform([request])
      } catch {
        continuation.resume(throwing: error)
      }
    }
  }

  private static func scan(_ observations: [VNRecognizedTextObservation]) -> PageScan {
    var tokens: [[String: Any]] = []
    var entities: [[String: Any]] = []
    var seen = Set<String>()

    for observation in observations {
      guard let candidate = observation.topCandidates(1).first else { continue }
      let full = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
      if full.isEmpty { continue }

      let words = full.split(whereSeparator: { $0.isWhitespace })
      var emittedWord = false
      if !words.isEmpty {
        var searchStart = full.startIndex
        for wordSub in words {
          let word = String(wordSub)
          guard let range = full.range(of: word, range: searchStart..<full.endIndex) else { continue }
          searchStart = range.upperBound
          if let box = try? candidate.boundingBox(for: range)?.boundingBox {
            tokens.append(boxDict(text: word, box: box))
            emittedWord = true
          }
        }
      }
      if !emittedWord {
        tokens.append(boxDict(text: full, box: observation.boundingBox))
      }

      func emit(_ text: String, _ category: String, _ badge: String, _ range: Range<String.Index>) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return }
        guard let box = try? candidate.boundingBox(for: range)?.boundingBox else { return }
        let key = "\(category)|\(badge)|\(trimmed.lowercased())|\(String(format: "%.3f", box.origin.x))|\(String(format: "%.3f", box.origin.y))"
        if seen.contains(key) { return }
        seen.insert(key)
        var row = boxDict(text: trimmed, box: box)
        row["category"] = category
        row["badge"] = badge
        entities.append(row)
      }

      detectData(in: full, emit: emit)
      detectNames(in: full, emit: emit)
      detectPatterns(in: full, emit: emit)
    }

    return PageScan(tokens: tokens, entities: entities)
  }

  private static func boxDict(text: String, box: CGRect) -> [String: Any] {
    [
      "text": text,
      "x": Double(box.origin.x),
      "y": Double(box.origin.y),
      "width": Double(box.size.width),
      "height": Double(box.size.height),
      "visionOrigin": true,
    ]
  }

  private static func detectData(
    in full: String,
    emit: (String, String, String, Range<String.Index>) -> Void
  ) {
    let types: NSTextCheckingTypes =
      NSTextCheckingResult.CheckingType.phoneNumber.rawValue
      | NSTextCheckingResult.CheckingType.link.rawValue
      | NSTextCheckingResult.CheckingType.address.rawValue
    guard let detector = try? NSDataDetector(types: types) else { return }
    let ns = full as NSString
    let fullRange = NSRange(location: 0, length: ns.length)
    detector.enumerateMatches(in: full, options: [], range: fullRange) { match, _, _ in
      guard let match = match, let range = Range(match.range, in: full) else { return }
      let text = ns.substring(with: match.range)
      switch match.resultType {
      case .phoneNumber:
        let lower = full.lowercased()
        let labeledId = lower.contains("vat") || lower.contains("tax id") || lower.contains("tax:")
        let compact = text.filter { $0.isNumber || $0 == "-" }
        let vatShape = compact.range(of: #"^\d{5,}-\d{3,}$"#, options: .regularExpression) != nil
        if !(labeledId && vatShape) {
          emit(text, "contacts", "Phone Number", range)
        }
      case .address:
        emit(text, "contacts", "Address", range)
      case .link:
        let scheme = match.url?.scheme?.lowercased() ?? ""
        if scheme == "mailto" || text.contains("@") {
          emit(text, "contacts", "Email", range)
        }
      default:
        break
      }
    }
  }

  private static func detectNames(
    in full: String,
    emit: (String, String, String, Range<String.Index>) -> Void
  ) {
    let tagger = NLTagger(tagSchemes: [.nameType])
    tagger.string = full
    tagger.enumerateTags(
      in: full.startIndex..<full.endIndex,
      unit: .word,
      scheme: .nameType,
      options: [.omitWhitespace, .omitPunctuation, .joinNames]
    ) { tag, range in
      guard let tag = tag else { return true }
      let text = String(full[range])
      let stop: Set<String> = [
        "total", "balance", "invoice", "statement", "amount", "paid", "tax", "vat",
        "subtotal", "page", "date", "receipt", "debit", "credit", "description",
        "transfer", "reference", "account", "number", "phone", "email", "address",
        "payment", "due", "from", "item", "items",
      ]
      let words = text.split(whereSeparator: { $0.isWhitespace }).map { token -> String in
        String(token).lowercased().filter { $0.isLetter }
      }.filter { $0.count > 1 && !stop.contains($0) }
      if tag == .personalName {
        if words.count >= 2 && text.count <= 48 {
          emit(text, "personal", "Name", range)
        }
      } else if tag == .organizationName {
        let lower = text.lowercased()
        let suffix = lower.contains("ltd") || lower.contains("inc") || lower.contains("pty")
          || lower.contains("llc") || lower.contains("gmbh") || lower.contains("corp")
          || lower.contains("limited") || lower.contains("bank")
        if text.count <= 48 && (suffix || words.count >= 2) {
          emit(text, "personal", "Organization", range)
        }
      }
      return true
    }
  }

  private static func detectPatterns(
    in full: String,
    emit: (String, String, String, Range<String.Index>) -> Void
  ) {
    let ns = full as NSString
    func matches(_ pattern: String, _ options: NSRegularExpression.Options = []) -> [NSTextCheckingResult] {
      guard let re = try? NSRegularExpression(pattern: pattern, options: options) else { return [] }
      return re.matches(in: full, range: NSRange(location: 0, length: ns.length))
    }
    func emitMatch(_ result: NSTextCheckingResult, _ category: String, _ badge: String, group: Int = 0) {
      let nsRange = result.range(at: group)
      guard nsRange.location != NSNotFound, let range = Range(nsRange, in: full) else { return }
      emit(ns.substring(with: nsRange), category, badge, range)
    }

    // Every currency or cents amount, including statement columns that
    // do not repeat the word "balance" on the row.
    for result in matches(#"(?:[\$€£]\s?|\bR\s?)-?\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?|\(\d{1,3}(?:[,\s]\d{3})*\.\d{2}\)|\b-?\d{1,3}(?:[,\s]\d{3})*\.\d{2}\b"#) {
      let raw = ns.substring(with: result.range)
      let digits = raw.filter(\.isNumber)
      if digits.count >= 3 {
        emitMatch(result, "financial", "Total / Balance")
      }
    }

    for result in matches(#"\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b"#, [.caseInsensitive]) {
      emitMatch(result, "financial", "IBAN")
    }

    for result in matches(#"(?:\d[ -]*?){13,19}"#) {
      let raw = ns.substring(with: result.range)
      let digits = raw.filter(\.isNumber)
      if (13...19).contains(digits.count), luhn(digits) {
        emitMatch(result, "financial", "Card Number")
      }
    }

    for result in matches(#"\b\d{9}\b"#) {
      let digits = ns.substring(with: result.range)
      if aba(digits) {
        emitMatch(result, "financial", "Routing Number")
      }
    }

    for result in matches(#"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}"#, [.caseInsensitive]) {
      emitMatch(result, "contacts", "Email")
    }

    for result in matches(#"\b\d{3}-\d{2}-\d{4}\b"#) {
      emitMatch(result, "tax", "ID Number")
    }
    for result in matches(#"(?i)\b(?:ssn|sin|tin|vat|tax(?:\s*id)?|national\s*id|id\s*(?:no|number))\b(?:\s*[:.]?\s*(?:no|number|nr|id))?\s*[:.#-]?\s*([A-Z0-9][A-Z0-9\-/]{5,20})"#) {
      emitMatch(result, "tax", "Tax ID", group: 1)
    }
    for result in matches(#"(?i)\bpassport\b[:\s#-]*([A-Z0-9]{6,13})"#) {
      emitMatch(result, "tax", "Passport", group: 1)
    }
    for result in matches(#"\b(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9]{3,}(?:-[A-Za-z0-9]{3,})+\b"#) {
      let raw = ns.substring(with: result.range)
      if raw.filter({ $0.isNumber || $0.isLetter }).count >= 12 {
        emitMatch(result, "tax", "ID Number")
      }
    }

    for phrase in ["Confidential", "Privileged", "Do Not Disclose", "Proprietary"] {
      var search = full.startIndex
      while let found = full.range(of: phrase, options: [.caseInsensitive], range: search..<full.endIndex) {
        emit(String(full[found]), "marker", "Classification", found)
        search = found.upperBound
      }
    }
  }

  private static func luhn(_ digits: String) -> Bool {
    var sum = 0
    for (i, ch) in digits.reversed().enumerated() {
      guard let d0 = ch.wholeNumberValue else { return false }
      var d = d0
      if i % 2 == 1 {
        d *= 2
        if d > 9 { d -= 9 }
      }
      sum += d
    }
    return sum % 10 == 0
  }

  private static func aba(_ digits: String) -> Bool {
    let vals = digits.compactMap(\.wholeNumberValue)
    guard vals.count == 9 else { return false }
    let sum = 3 * (vals[0] + vals[3] + vals[6])
      + 7 * (vals[1] + vals[4] + vals[7])
      + (vals[2] + vals[5] + vals[8])
    return sum != 0 && sum % 10 == 0
  }

  private static func render(page: PDFPage, boxes: [FlatRect]) -> UIImage {
    let media = page.bounds(for: .mediaBox)
    let scale: CGFloat = 2
    let size = CGSize(width: max(media.width * scale, 1), height: max(media.height * scale, 1))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    return renderer.image { rendererCtx in
      let ctx = rendererCtx.cgContext
      UIColor.white.setFill()
      ctx.fill(CGRect(origin: .zero, size: size))
      ctx.saveGState()
      ctx.translateBy(x: 0, y: size.height)
      ctx.scaleBy(x: size.width / max(media.width, 1), y: -size.height / max(media.height, 1))
      page.draw(with: .mediaBox, to: ctx)
      ctx.restoreGState()
      UIColor.black.setFill()
      for box in boxes {
        let rect = CGRect(
          x: box.x * size.width,
          y: box.y * size.height,
          width: box.width * size.width,
          height: box.height * size.height
        )
        ctx.fill(rect)
      }
    }
  }

  private static func paint(image: UIImage, boxes: [FlatRect]) -> UIImage {
    let size = image.size
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    return renderer.image { rendererCtx in
      image.draw(in: CGRect(origin: .zero, size: size))
      UIColor.black.setFill()
      for box in boxes {
        rendererCtx.fill(CGRect(
          x: box.x * size.width,
          y: box.y * size.height,
          width: box.width * size.width,
          height: box.height * size.height
        ))
      }
    }
  }

  private static func flattenPdfPages(_ url: URL, boxes: [FlatRect]) throws -> [UIImage] {
    guard let doc = PDFDocument(url: url) else { throw err("Could not open PDF") }
    var images: [UIImage] = []
    for index in 0..<doc.pageCount {
      guard let page = doc.page(at: index) else { continue }
      let pageBoxes = boxes.filter { $0.page == index }
      images.append(render(page: page, boxes: pageBoxes))
    }
    if images.isEmpty { throw err("PDF has no pages") }
    return images
  }

  private static func writeImagePdf(_ images: [UIImage]) throws -> String {
    let out = PDFDocument()
    for (index, image) in images.enumerated() {
      guard let page = PDFPage(image: image) else { continue }
      out.insert(page, at: index)
    }
    out.documentAttributes = [
      PDFDocumentAttribute.titleAttribute: "Redacted Document",
      PDFDocumentAttribute.authorAttribute: "RedactPDF",
      PDFDocumentAttribute.creatorAttribute: "RedactPDF",
      PDFDocumentAttribute.producerAttribute: "RedactPDF",
      PDFDocumentAttribute.subjectAttribute: "",
      PDFDocumentAttribute.keywordsAttribute: [],
    ]
    let name = "RedactPDF_flat_\(Int(Date().timeIntervalSince1970)).pdf"
    let dest = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(name)
    if !out.write(to: dest) {
      throw err("Could not write flattened PDF")
    }
    return dest.absoluteString
  }

  private static func parseRects(_ raw: [[String: Any]]) -> [FlatRect] {
    raw.compactMap { row in
      func num(_ key: String) -> CGFloat? {
        if let n = row[key] as? NSNumber { return CGFloat(truncating: n) }
        if let n = row[key] as? Double { return CGFloat(n) }
        if let n = row[key] as? Int { return CGFloat(n) }
        return nil
      }
      guard let x = num("x"), let y = num("y"), let w = num("width"), let h = num("height") else {
        return nil
      }
      let page = Int(num("pageIndex") ?? 0)
      return FlatRect(page: page, x: x, y: y, width: w, height: h)
    }
  }
}

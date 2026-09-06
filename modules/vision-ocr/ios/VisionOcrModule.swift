import ExpoModulesCore
import Vision
import UIKit
import ImageIO

public class VisionOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionOcr")

    Function("isAvailable") { () -> Bool in
      return true
    }

    AsyncFunction("recognizeText") { (uriString: String) -> [[String: Any]] in
      let fileURL = Self.fileURL(from: uriString)

      guard let imageSource = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
            let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        throw NSError(
          domain: "VisionOcr",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "Could not load image at \(uriString)"]
        )
      }

      return try await withCheckedThrowingContinuation { continuation in
        let request = VNRecognizeTextRequest { request, error in
          if let error = error {
            continuation.resume(throwing: error)
            return
          }

          guard let observations = request.results as? [VNRecognizedTextObservation] else {
            continuation.resume(returning: [])
            return
          }

          var boxes: [[String: Any]] = []
          for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            let full = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            if full.isEmpty { continue }

            // Prefer word-level boxes for anchor adjacency + clean line unions.
            // Fall back to the observation box when string-range geometry fails.
            let words = full.split(whereSeparator: { $0.isWhitespace })
            var emittedWord = false

            if words.count >= 1 {
              var searchStart = full.startIndex
              for wordSub in words {
                let word = String(wordSub)
                guard let range = full.range(of: word, range: searchStart..<full.endIndex) else {
                  continue
                }
                searchStart = range.upperBound
                if let boxObs = try? candidate.boundingBox(for: range)?.boundingBox {
                  boxes.append([
                    "text": word,
                    "x": Double(boxObs.origin.x),
                    "y": Double(boxObs.origin.y),
                    "width": Double(boxObs.size.width),
                    "height": Double(boxObs.size.height),
                    "visionOrigin": true
                  ])
                  emittedWord = true
                }
              }
            }

            if !emittedWord {
              let box = observation.boundingBox
              boxes.append([
                "text": full,
                "x": Double(box.origin.x),
                "y": Double(box.origin.y),
                "width": Double(box.size.width),
                "height": Double(box.size.height),
                "visionOrigin": true
              ])
            }
          }
          continuation.resume(returning: boxes)
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
}

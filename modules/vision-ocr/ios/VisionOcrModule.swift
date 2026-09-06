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
            let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty { continue }

            // Vision boundingBox is normalized bottom-left origin.
            let box = observation.boundingBox
            boxes.append([
              "text": text,
              "x": Double(box.origin.x),
              "y": Double(box.origin.y),
              "width": Double(box.size.width),
              "height": Double(box.size.height),
              "visionOrigin": true
            ])
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

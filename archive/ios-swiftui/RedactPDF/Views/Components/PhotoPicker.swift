import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct PhotoPicker: UIViewControllerRepresentable {
    let onPick: (URL) -> Void

    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .images
        config.selectionLimit = 10
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick, dismiss: dismiss)
    }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let onPick: (URL) -> Void
        let dismiss: DismissAction

        init(onPick: @escaping (URL) -> Void, dismiss: DismissAction) {
            self.onPick = onPick
            self.dismiss = dismiss
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            dismiss()
            guard !results.isEmpty else { return }

            let group = DispatchGroup()
            var images: [UIImage] = []

            for result in results {
                group.enter()
                result.itemProvider.loadObject(ofClass: UIImage.self) { object, _ in
                    if let image = object as? UIImage {
                        images.append(image)
                    }
                    group.leave()
                }
            }

            group.notify(queue: .global(qos: .userInitiated)) {
                guard !images.isEmpty else { return }
                if let pdfURL = Self.createPDF(from: images) {
                    DispatchQueue.main.async {
                        self.onPick(pdfURL)
                    }
                }
            }
        }

        private static func createPDF(from images: [UIImage]) -> URL? {
            let pdfURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("Scan_\(UUID().uuidString).pdf")

            let pageRect = CGRect(x: 0, y: 0, width: 612, height: 792)
            let renderer = UIGraphicsPDFRenderer(bounds: pageRect)

            let data = renderer.pdfData { context in
                for image in images {
                    context.beginPage()
                    let aspect = min(pageRect.width / image.size.width, pageRect.height / image.size.height)
                    let width = image.size.width * aspect
                    let height = image.size.height * aspect
                    let origin = CGPoint(
                        x: (pageRect.width - width) / 2,
                        y: (pageRect.height - height) / 2
                    )
                    image.draw(in: CGRect(origin: origin, size: CGSize(width: width, height: height)))
                }
            }

            do {
                try data.write(to: pdfURL)
                return pdfURL
            } catch {
                return nil
            }
        }
    }
}

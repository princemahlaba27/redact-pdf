import PDFKit
import SwiftUI
import UIKit

struct PDFKitView: UIViewRepresentable {
    let document: PDFDocument
    @Binding var currentPageIndex: Int

    func makeUIView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.document = document
        pdfView.autoScales = true
        pdfView.displayMode = .singlePage
        pdfView.displayDirection = .vertical
        pdfView.backgroundColor = UIColor(AppleDS.Color.surface)
        pdfView.pageShadowsEnabled = false
        pdfView.delegate = context.coordinator
        return pdfView
    }

    func updateUIView(_ pdfView: PDFView, context: Context) {
        if pdfView.document !== document {
            pdfView.document = document
        }

        if let page = document.page(at: currentPageIndex),
           pdfView.currentPage !== page {
            pdfView.go(to: page)
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(currentPageIndex: $currentPageIndex)
    }

    final class Coordinator: NSObject, PDFViewDelegate {
        @Binding var currentPageIndex: Int

        init(currentPageIndex: Binding<Int>) {
            _currentPageIndex = currentPageIndex
        }

        func pdfViewPageChanged(_ sender: PDFView) {
            guard let document = sender.document,
                  let currentPage = sender.currentPage else { return }
            let index = document.index(for: currentPage)
            if index != NSNotFound, index != currentPageIndex {
                currentPageIndex = index
            }
        }
    }
}

import PDFKit
import SwiftUI

struct PDFEditorView: View {
    let documentURL: URL
    let documentTitle: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var subscriptionManager = SubscriptionManager.shared

    @State private var pdfDocument: PDFDocument?
    @State private var currentPageIndex = 0
    @State private var redactionMode: RedactionMode = .manual
    @State private var redactionStyle: RedactionStyle = .black
    @State private var redactions: [RedactionRect] = []
    @State private var isDetecting = false
    @State private var showPaywall = false
    @State private var showShareSheet = false
    @State private var exportedURL: URL?
    @State private var isExporting = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppleDS.Color.surface
                    .ignoresSafeArea()

                if let pdfDocument {
                    editorContent(document: pdfDocument)
                } else {
                    ProgressView("Loading document…")
                        .progressViewStyle(.circular)
                        .foregroundStyle(AppleDS.Color.labelSecondary)
                }

                if isDetecting {
                    AppleLoadingOverlay(message: "Scanning for sensitive data…")
                } else if isExporting {
                    AppleLoadingOverlay(message: "Flattening & sanitizing…")
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        HapticManager.selection()
                        dismiss()
                    }
                    .font(AppleDS.Font.body)
                    .foregroundStyle(AppleDS.Color.labelSecondary)
                }
                ToolbarItem(placement: .principal) {
                    Text(documentTitle)
                        .font(AppleDS.Font.footnoteMedium)
                        .foregroundStyle(AppleDS.Color.labelSecondary)
                        .lineLimit(1)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    AppleToolbarButton(title: "Export") {
                        HapticManager.impact(.medium)
                        Task { await handleExportTap() }
                    }
                    .disabled(pdfDocument == nil || isExporting)
                    .opacity(pdfDocument == nil || isExporting ? 0.5 : 1)
                }
            }
            .toolbarBackground(AppleDS.Color.surface, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .onAppear { loadDocument() }
        .onChange(of: redactionMode) { _, newMode in
            if newMode == .smart {
                runSmartDetection()
            }
        }
        .sheet(isPresented: $showPaywall) {
            PaywallView {
                Task { await performExport() }
            }
        }
        .sheet(isPresented: $showShareSheet) {
            if let exportedURL {
                ShareSheet(items: [exportedURL])
            }
        }
    }

    @ViewBuilder
    private func editorContent(document: PDFDocument) -> some View {
        VStack(spacing: 0) {
            PDFKitView(
                document: document,
                currentPageIndex: $currentPageIndex
            )
            .overlay {
                CanvasOverlayView(
                    redactions: redactionsForCurrentPage,
                    currentStyle: redactionStyle,
                    onRedactionAdded: { rect in
                        addRedaction(rect: rect)
                    }
                )
            }

            floatingToolbar
        }
    }

    private var floatingToolbar: some View {
        AppleFloatingToolbar {
            LiquidGlassContainer(spacing: AppleDS.Spacing.md) {
                HStack(spacing: AppleDS.Spacing.md) {
                    Picker("Mode", selection: $redactionMode) {
                        ForEach(RedactionMode.allCases) { mode in
                            Text(mode.rawValue).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 196)
                    .onChange(of: redactionMode) { _, _ in HapticManager.selection() }

                    styleMenu

                    Text("\(redactions.count) Redactions")
                        .font(AppleDS.Font.captionMedium)
                        .foregroundStyle(AppleDS.Color.labelTertiary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)

                    Spacer(minLength: 0)

                    Button {
                        undoLastRedaction()
                    } label: {
                        Image(systemName: "arrow.uturn.backward")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(
                                redactions.isEmpty
                                    ? AppleDS.Color.labelQuaternary
                                    : AppleDS.Color.labelPrimary.opacity(0.85)
                            )
                            .frame(width: AppleDS.Layout.minTouchTarget, height: AppleDS.Layout.minTouchTarget)
                    }
                    .disabled(redactions.isEmpty)
                }
            }
        }
    }

    private var styleMenu: some View {
        Menu {
            ForEach(RedactionStyle.allCases) { style in
                Button {
                    redactionStyle = style
                    HapticManager.selection()
                } label: {
                    Label(
                        style.rawValue,
                        systemImage: style == redactionStyle ? "checkmark.circle.fill" : "circle.fill"
                    )
                }
            }
        } label: {
            Circle()
                .fill(redactionStyle.previewColor)
                .frame(width: 28, height: 28)
                .overlay(Circle().strokeBorder(AppleDS.Color.separator, lineWidth: 1))
        }
        .frame(minWidth: AppleDS.Layout.minTouchTarget, minHeight: AppleDS.Layout.minTouchTarget)
    }

    private func handleExportTap() async {
        if subscriptionManager.isSubscribed {
            await performExport()
        } else {
            let granted = await subscriptionManager.requestExportAccess()
            if granted {
                await performExport()
            } else {
                showPaywall = true
            }
        }
    }

    private func performExport() async {
        guard let pdfDocument else { return }
        isExporting = true
        defer { isExporting = false }

        let url = await Task.detached(priority: .userInitiated) {
            RedactionEngine.burnAndFlatten(pdfDocument: pdfDocument, redactions: redactions)
        }.value

        if let url {
            exportedURL = url
            HapticManager.notification(.success)
            showShareSheet = true
        } else {
            HapticManager.notification(.error)
        }
    }

    private func runSmartDetection() {
        guard let pdfDocument,
              let page = pdfDocument.page(at: currentPageIndex) else { return }

        isDetecting = true
        RedactionEngine.detectPII(in: page) { rects in
            isDetecting = false
            let newRedactions = rects.map { rect in
                RedactionRect(pageIndex: currentPageIndex, rect: rect, style: redactionStyle)
            }
            redactions.append(contentsOf: newRedactions)
            HapticManager.notification(newRedactions.isEmpty ? .warning : .success)
        }
    }

    private var redactionsForCurrentPage: [RedactionRect] {
        redactions.filter { $0.pageIndex == currentPageIndex }
    }

    private func addRedaction(rect: CGRect) {
        guard rect.width > 4, rect.height > 4 else { return }
        redactions.append(RedactionRect(pageIndex: currentPageIndex, rect: rect, style: redactionStyle))
        HapticManager.impact(.light)
    }

    private func undoLastRedaction() {
        guard !redactions.isEmpty else { return }
        redactions.removeLast()
        HapticManager.selection()
    }

    private func loadDocument() {
        pdfDocument = PDFDocument(url: documentURL)
    }
}

#Preview {
    PDFEditorView(documentURL: URL(fileURLWithPath: "/tmp/sample.pdf"), documentTitle: "Sample")
}

import SwiftUI
import UniformTypeIdentifiers

struct MainDashboardView: View {
    @State private var showDocumentPicker = false
    @State private var showPhotoPicker = false
    @State private var loadedDocument: LoadedPDFDocument?

    var body: some View {
        NavigationStack {
            ZStack {
                AppleScreenBackground()

                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: AppleDS.Spacing.xxl - 4) {
                        heroSection
                        actionCards
                        AppleTrustBanner(
                            icon: "shield.lefthalf.filled",
                            text: "Zero Cloud Processing • Metadata Flattened On Export"
                        )
                    }
                    .padding(.horizontal, AppleDS.Layout.screenHorizontalPadding)
                    .padding(.top, AppleDS.Spacing.xs)
                    .padding(.bottom, AppleDS.Spacing.xxxl)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: AppleDS.Spacing.xs) {
                        Image(systemName: "doc.text.fill")
                            .font(.system(size: 18, weight: .semibold))
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(AppleDS.Color.accent)
                        Text("RedactPDF")
                            .font(AppleDS.Font.navBrand)
                            .foregroundStyle(AppleDS.Color.labelPrimary)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    AppleBadge(text: "100% On-Device")
                }
            }
            .toolbarBackground(AppleDS.Color.canvas, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .sheet(isPresented: $showDocumentPicker) {
            DocumentPicker(contentTypes: [.pdf]) { url in
                openDocument(from: url)
            }
        }
        .sheet(isPresented: $showPhotoPicker) {
            PhotoPicker { url in
                openDocument(from: url)
            }
        }
        .fullScreenCover(item: $loadedDocument) { document in
            PDFEditorView(documentURL: document.url, documentTitle: document.title)
        }
    }

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: AppleDS.Spacing.sm) {
            Text("Sanitize documents.\nKeep data private.")
                .font(AppleDS.Font.hero)
                .foregroundStyle(AppleDS.Color.labelPrimary)
                .fixedSize(horizontal: false, vertical: true)

            Text("Permanently black out text, SSNs, and financials with on-device pixel-burning.")
                .font(AppleDS.Font.body)
                .foregroundStyle(AppleDS.Color.labelSecondary)
                .lineSpacing(5)
        }
        .padding(.top, AppleDS.Spacing.sm)
    }

    private var actionCards: some View {
        VStack(spacing: AppleDS.Spacing.sm + 2) {
            AppleActionCard(
                icon: "doc.fill",
                title: "Open PDF Document",
                subtitle: "Contracts, tax forms, statements",
                isPrimary: true
            ) {
                HapticManager.impact(.medium)
                showDocumentPicker = true
            }

            AppleActionCard(
                icon: "photo.on.rectangle",
                title: "Select Photo or Scan",
                subtitle: "Import scanned pages as PDF"
            ) {
                HapticManager.impact(.light)
                showPhotoPicker = true
            }
        }
    }

    private func openDocument(from url: URL) {
        let didStartAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didStartAccess { url.stopAccessingSecurityScopedResource() }
        }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(url.lastPathComponent)

        do {
            if FileManager.default.fileExists(atPath: tempURL.path) {
                try FileManager.default.removeItem(at: tempURL)
            }
            try FileManager.default.copyItem(at: url, to: tempURL)
            loadedDocument = LoadedPDFDocument(url: tempURL, title: url.deletingPathExtension().lastPathComponent)
            HapticManager.notification(.success)
        } catch {
            HapticManager.notification(.error)
        }
    }
}

#Preview {
    MainDashboardView()
        .preferredColorScheme(.dark)
}

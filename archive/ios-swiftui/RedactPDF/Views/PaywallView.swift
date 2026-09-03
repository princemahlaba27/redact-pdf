import SwiftUI
import SuperwallKit

struct PaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var subscriptionManager = SubscriptionManager.shared

    @State private var isPurchasing = false

    var onPurchaseSuccess: (() -> Void)?

    var body: some View {
        ZStack {
            AppleScreenBackground()

            ScrollView(showsIndicators: false) {
                VStack(spacing: AppleDS.Spacing.xxl - 4) {
                    closeButton
                    heroHeader
                    valueProps
                    ApplePricingCard(
                        title: "Introductory Offer: $0.49 for 7 Days",
                        subtitle: "Then $9.99/week recurring. Cancel anytime."
                    )
                    purchaseButton
                    complianceLinks
                }
                .padding(.horizontal, AppleDS.Spacing.xl)
                .padding(.bottom, AppleDS.Spacing.xxxl)
            }
        }
        .preferredColorScheme(.dark)
    }

    private var closeButton: some View {
        HStack {
            Spacer()
            Button {
                HapticManager.selection()
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 28))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(AppleDS.Color.labelQuaternary)
            }
            .frame(minWidth: AppleDS.Layout.minTouchTarget, minHeight: AppleDS.Layout.minTouchTarget)
        }
        .padding(.top, AppleDS.Spacing.xs)
    }

    private var heroHeader: some View {
        VStack(spacing: AppleDS.Spacing.md) {
            AppleHeroIcon(systemName: "checkmark.shield.fill")

            VStack(spacing: AppleDS.Spacing.xs) {
                Text("RedactPDF Pro")
                    .font(AppleDS.Font.title)
                    .foregroundStyle(AppleDS.Color.labelPrimary)

                Text("Unlock unlimited document exports and permanent metadata sanitization.")
                    .font(AppleDS.Font.subheadline)
                    .foregroundStyle(AppleDS.Color.labelSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
        }
    }

    private var valueProps: some View {
        AppleSectionCard {
            AppleValuePropRow(icon: "arrow.down.doc.fill", text: "Unlimited Flattened PDF Exports")
            AppleValuePropRow(icon: "brain.head.profile", text: "Automated AI Detection (SSN, Financials, IDs)")
            AppleValuePropRow(icon: "flame.fill", text: "Permanent Pixel-Level Destruction (No copy/paste leaks)")
        }
    }

    private var purchaseButton: some View {
        ApplePrimaryButton(
            title: "Start 7-Day Access - $0.49",
            isLoading: isPurchasing || subscriptionManager.isLoading
        ) {
            HapticManager.impact(.medium)
            isPurchasing = true
            subscriptionManager.purchaseViaPaywall()
            Superwall.shared.register(event: "paywall_cta") {
                Task { @MainActor in
                    isPurchasing = false
                    if subscriptionManager.isSubscribed {
                        HapticManager.notification(.success)
                        onPurchaseSuccess?()
                        dismiss()
                    }
                }
            }
        }
    }

    private var complianceLinks: some View {
        HStack(spacing: AppleDS.Spacing.xxs) {
            Button("Restore Purchases") {
                Task { await subscriptionManager.restorePurchases() }
            }
            Text("•")
            Link("Terms", destination: URL(string: "https://redactpdf.app/terms")!)
            Text("•")
            Link("Privacy Policy", destination: URL(string: "https://redactpdf.app/privacy")!)
        }
        .font(AppleDS.Font.caption)
        .foregroundStyle(AppleDS.Color.labelQuaternary)
    }
}

#Preview {
    PaywallView()
}

import SwiftUI

// MARK: - Screen Background

struct AppleScreenBackground: View {
    var body: some View {
        ZStack {
            AppleDS.Color.canvas

            RadialGradient(
                colors: [
                    AppleDS.Color.accent.opacity(0.07),
                    SwiftUI.Color.clear
                ],
                center: .topLeading,
                startRadius: 0,
                endRadius: 420
            )

            RadialGradient(
                colors: [
                    AppleDS.Color.success.opacity(0.04),
                    SwiftUI.Color.clear
                ],
                center: .bottomTrailing,
                startRadius: 0,
                endRadius: 360
            )
        }
        .ignoresSafeArea()
    }
}

// MARK: - Badge

struct AppleBadge: View {
    let text: String
    var showsLiveDot = true
    var dotColor: SwiftUI.Color = AppleDS.Color.success

    var body: some View {
        HStack(spacing: AppleDS.Spacing.xxs + 2) {
            if showsLiveDot {
                Circle()
                    .fill(dotColor)
                    .frame(width: 7, height: 7)
            }
            Text(text)
                .font(AppleDS.Font.captionMedium)
                .foregroundStyle(AppleDS.Color.labelSecondary)
        }
        .padding(.horizontal, AppleDS.Spacing.sm)
        .padding(.vertical, AppleDS.Spacing.xxs + 2)
        .liquidGlassCapsule()
    }
}

// MARK: - Action Card

struct AppleActionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    var isPrimary = false
    let action: () -> Void

    var body: some View {
        Button {
            action()
        } label: {
            HStack(spacing: AppleDS.Spacing.md) {
                iconContainer
                textContent
                Spacer(minLength: AppleDS.Spacing.xs)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppleDS.Color.labelQuaternary)
            }
            .padding(AppleDS.Layout.cardPadding)
            .contentShape(RoundedRectangle(cornerRadius: AppleDS.Radius.lg, style: .continuous))
        }
        .buttonStyle(ApplePressableButtonStyle())
        .liquidGlass(isPrimary ? .prominent : .regular, cornerRadius: AppleDS.Radius.lg, interactive: true)
    }

    private var iconContainer: some View {
        ZStack {
            RoundedRectangle(cornerRadius: AppleDS.Radius.icon, style: .continuous)
                .fill(isPrimary ? AppleDS.Color.accentMuted : SwiftUI.Color.white.opacity(0.06))
                .frame(width: AppleDS.Layout.iconContainerSize, height: AppleDS.Layout.iconContainerSize)
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(isPrimary ? AppleDS.Color.accent : AppleDS.Color.labelPrimary.opacity(0.88))
        }
    }

    private var textContent: some View {
        VStack(alignment: .leading, spacing: AppleDS.Spacing.xxs) {
            Text(title)
                .font(AppleDS.Font.headline)
                .foregroundStyle(AppleDS.Color.labelPrimary)
            Text(subtitle)
                .font(AppleDS.Font.footnote)
                .foregroundStyle(AppleDS.Color.labelTertiary)
        }
    }
}

// MARK: - Trust Banner

struct AppleTrustBanner: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: AppleDS.Spacing.sm - 2) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(AppleDS.Color.success)
            Text(text)
                .font(AppleDS.Font.footnoteMedium)
                .foregroundStyle(AppleDS.Color.labelTertiary)
                .multilineTextAlignment(.leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, AppleDS.Spacing.md)
        .padding(.horizontal, AppleDS.Spacing.lg - 2)
        .background {
            RoundedRectangle(cornerRadius: AppleDS.Radius.sm + 2, style: .continuous)
                .fill(AppleDS.Color.successMuted.opacity(0.35))
                .overlay {
                    RoundedRectangle(cornerRadius: AppleDS.Radius.sm + 2, style: .continuous)
                        .strokeBorder(AppleDS.Color.separatorOpaque, lineWidth: 0.5)
                }
        }
    }
}

// MARK: - Buttons

struct ApplePrimaryButton: View {
    let title: String
    var isLoading = false
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if isLoading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text(title)
                        .font(AppleDS.Font.headline)
                }
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(minHeight: AppleDS.Layout.minTouchTarget + 6)
            .background {
                RoundedRectangle(cornerRadius: AppleDS.Radius.md, style: .continuous)
                    .fill(isEnabled ? AppleDS.Color.accent : AppleDS.Color.accent.opacity(0.4))
            }
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isLoading)
    }
}

struct AppleToolbarButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(AppleDS.Font.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, AppleDS.Spacing.md)
                .padding(.vertical, AppleDS.Spacing.xs)
                .background(Capsule(style: .continuous).fill(AppleDS.Color.accent))
        }
        .buttonStyle(.plain)
    }
}

struct ApplePressableButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(AppleDS.Motion.springSnappy, value: configuration.isPressed)
    }
}

// MARK: - Value Prop Row

struct AppleValuePropRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: AppleDS.Spacing.sm + 2) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 17))
                .foregroundStyle(AppleDS.Color.success)
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(AppleDS.Color.accent)
                .frame(width: 22)
            Text(text)
                .font(AppleDS.Font.subheadline.weight(.medium))
                .foregroundStyle(AppleDS.Color.labelPrimary.opacity(0.88))
        }
    }
}

// MARK: - Floating Toolbar

struct AppleFloatingToolbar<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .padding(.horizontal, AppleDS.Spacing.lg)
            .padding(.vertical, AppleDS.Spacing.sm + 2)
            .liquidGlassCapsule()
            .padding(.horizontal, AppleDS.Spacing.md)
            .padding(.bottom, AppleDS.Spacing.sm + 2)
    }
}

// MARK: - Loading Overlay

struct AppleLoadingOverlay: View {
    let message: String

    var body: some View {
        ZStack {
            SwiftUI.Color.black.opacity(0.42)
                .ignoresSafeArea()

            VStack(spacing: AppleDS.Spacing.sm + 2) {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(1.15)
                Text(message)
                    .font(AppleDS.Font.subheadline.weight(.medium))
                    .foregroundStyle(AppleDS.Color.labelSecondary)
            }
            .padding(AppleDS.Spacing.xxl - 4)
            .liquidGlass(cornerRadius: AppleDS.Radius.md)
        }
    }
}

// MARK: - Section Card

struct AppleSectionCard<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: AppleDS.Spacing.md) {
            content()
        }
        .padding(AppleDS.Spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .liquidGlass(cornerRadius: AppleDS.Radius.lg)
    }
}

// MARK: - Pricing Card

struct ApplePricingCard: View {
    let title: String
    let subtitle: String
    var isSelected = true

    var body: some View {
        VStack(spacing: AppleDS.Spacing.xs) {
            Text(title)
                .font(AppleDS.Font.headline)
                .foregroundStyle(AppleDS.Color.labelPrimary)
            Text(subtitle)
                .font(AppleDS.Font.footnote)
                .foregroundStyle(AppleDS.Color.labelTertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, AppleDS.Spacing.xl - 2)
        .padding(.horizontal, AppleDS.Spacing.lg - 2)
        .liquidGlass(.prominent, cornerRadius: AppleDS.Radius.lg)
    }
}

// MARK: - Hero Icon

struct AppleHeroIcon: View {
    let systemName: String
    @State private var glowPhase = false

    var body: some View {
        ZStack {
            Circle()
                .fill(AppleDS.Color.accent.opacity(glowPhase ? 0.22 : 0.08))
                .frame(width: 108, height: 108)
                .blur(radius: 24)
                .animation(.easeInOut(duration: 2.4).repeatForever(autoreverses: true), value: glowPhase)

            Image(systemName: systemName)
                .font(.system(size: 52))
                .symbolRenderingMode(.palette)
                .foregroundStyle(AppleDS.Color.accent, AppleDS.Color.accent.opacity(0.65))
        }
        .onAppear { glowPhase = true }
    }
}

import SwiftUI

// MARK: - Liquid Glass Support
// Implements Apple Liquid Glass hierarchy on iOS 17+ via materials.
// On iOS 26+, swap internals to `.glassEffect()` when raising deployment target.

enum GlassVariant {
    case regular
    case prominent
    case tinted(SwiftUI.Color)
}

struct LiquidGlassModifier: ViewModifier {
    let variant: GlassVariant
    let cornerRadius: CGFloat
    let isInteractive: Bool

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        content
            .background { glassBackground }
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(strokeColor, lineWidth: 0.5)
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }

    @ViewBuilder
    private var glassBackground: some View {
        if reduceTransparency {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(AppleDS.Color.surfaceGrouped)
        } else {
            RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .background {
                    RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                        .fill(tintOverlay)
                }
        }
    }

    private var tintOverlay: SwiftUI.Color {
        switch variant {
        case .regular:
            return SwiftUI.Color.white.opacity(0.03)
        case .prominent:
            return AppleDS.Color.accentMuted
        case .tinted(let color):
            return color.opacity(0.12)
        }
    }

    private var strokeColor: SwiftUI.Color {
        switch variant {
        case .prominent:
            return AppleDS.Color.accent.opacity(0.35)
        default:
            return AppleDS.Color.separatorOpaque
        }
    }
}

struct LiquidGlassCapsuleModifier: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        content
            .background {
                if reduceTransparency {
                    Capsule(style: .continuous)
                        .fill(AppleDS.Color.surfaceGrouped)
                } else {
                    Capsule(style: .continuous)
                        .fill(.ultraThinMaterial)
                        .background {
                            Capsule(style: .continuous)
                                .fill(SwiftUI.Color.white.opacity(0.04))
                        }
                }
            }
            .overlay {
                Capsule(style: .continuous)
                    .strokeBorder(AppleDS.Color.separatorOpaque, lineWidth: 0.5)
            }
            .clipShape(Capsule(style: .continuous))
    }
}

extension View {
    func liquidGlass(
        _ variant: GlassVariant = .regular,
        cornerRadius: CGFloat = AppleDS.Radius.lg,
        interactive: Bool = false
    ) -> some View {
        modifier(LiquidGlassModifier(variant: variant, cornerRadius: cornerRadius, isInteractive: interactive))
    }

    func liquidGlassCapsule() -> some View {
        modifier(LiquidGlassCapsuleModifier())
    }
}

/// Groups floating chrome elements — mirrors `GlassEffectContainer` spacing guidance.
struct LiquidGlassContainer<Content: View>: View {
    let spacing: CGFloat
    @ViewBuilder let content: () -> Content

    init(spacing: CGFloat = AppleDS.Spacing.md, @ViewBuilder content: @escaping () -> Content) {
        self.spacing = spacing
        self.content = content
    }

    var body: some View {
        content()
    }
}

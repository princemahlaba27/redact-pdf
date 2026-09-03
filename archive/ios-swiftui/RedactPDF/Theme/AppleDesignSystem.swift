import SwiftUI

// MARK: - Apple HIG Design System
// Based on Apple Human Interface Guidelines + Liquid Glass hierarchy principles:
// content sits on solid surfaces; controls float above on translucent materials.

enum AppleDS {

    // MARK: Colors

    enum Color {
        static let canvas = SwiftUI.Color(red: 0x0B / 255, green: 0x0B / 255, blue: 0x0C / 255)
        static let surface = SwiftUI.Color(red: 0x0D / 255, green: 0x0D / 255, blue: 0x0E / 255)
        static let surfaceElevated = SwiftUI.Color(red: 0x14 / 255, green: 0x14 / 255, blue: 0x16 / 255)
        static let surfaceGrouped = SwiftUI.Color(red: 0x1C / 255, green: 0x1C / 255, blue: 0x1E / 255)

        static let labelPrimary = SwiftUI.Color.white
        static let labelSecondary = SwiftUI.Color.white.opacity(0.62)
        static let labelTertiary = SwiftUI.Color.white.opacity(0.42)
        static let labelQuaternary = SwiftUI.Color.white.opacity(0.28)

        static let separator = SwiftUI.Color.white.opacity(0.10)
        static let separatorOpaque = SwiftUI.Color.white.opacity(0.08)

        static let accent = SwiftUI.Color(red: 0.04, green: 0.52, blue: 1.0)
        static let accentMuted = SwiftUI.Color(red: 0.04, green: 0.52, blue: 1.0).opacity(0.18)
        static let success = SwiftUI.Color(red: 0.20, green: 0.84, blue: 0.42)
        static let successMuted = SwiftUI.Color(red: 0.20, green: 0.84, blue: 0.42).opacity(0.16)
    }

    // MARK: Typography (SF Pro semantic scale)

    enum Font {
        static let largeTitle = SwiftUI.Font.system(.largeTitle, design: .rounded, weight: .bold)
        static let title = SwiftUI.Font.system(.title, design: .rounded, weight: .bold)
        static let title2 = SwiftUI.Font.system(.title2, design: .rounded, weight: .semibold)
        static let title3 = SwiftUI.Font.system(.title3, design: .rounded, weight: .semibold)
        static let headline = SwiftUI.Font.system(.headline, design: .default, weight: .semibold)
        static let body = SwiftUI.Font.system(.body, design: .default, weight: .regular)
        static let callout = SwiftUI.Font.system(.callout, design: .default, weight: .regular)
        static let subheadline = SwiftUI.Font.system(.subheadline, design: .default, weight: .regular)
        static let footnote = SwiftUI.Font.system(.footnote, design: .default, weight: .regular)
        static let footnoteMedium = SwiftUI.Font.system(.footnote, design: .default, weight: .medium)
        static let caption = SwiftUI.Font.system(.caption, design: .default, weight: .regular)
        static let captionMedium = SwiftUI.Font.system(.caption, design: .default, weight: .medium)

        static let hero = SwiftUI.Font.system(size: 34, weight: .bold, design: .rounded)
        static let navBrand = SwiftUI.Font.system(size: 20, weight: .bold, design: .rounded)
    }

    // MARK: Spacing (8pt grid)

    enum Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 20
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
        static let xxxl: CGFloat = 40
    }

    // MARK: Radius (continuous corners per HIG)

    enum Radius {
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 20
        static let xl: CGFloat = 24
        static let pill: CGFloat = 100
        static let icon: CGFloat = 14
    }

    // MARK: Layout

    enum Layout {
        static let minTouchTarget: CGFloat = 44
        static let screenHorizontalPadding: CGFloat = 20
        static let cardPadding: CGFloat = 18
        static let iconContainerSize: CGFloat = 52
    }

    // MARK: Animation

    enum Motion {
        static let spring = Animation.spring(response: 0.38, dampingFraction: 0.82)
        static let springSnappy = Animation.spring(response: 0.28, dampingFraction: 0.86)
        static let easeOut = Animation.easeOut(duration: 0.22)
    }
}

// MARK: - Backward Compatibility

enum AppTheme {
    static let obsidian = AppleDS.Color.surface
    static let dashboardBackground = AppleDS.Color.canvas
    static let subtleBorder = AppleDS.Color.separatorOpaque
    static let cornerRadius = AppleDS.Radius.lg
    static let accentBlue = AppleDS.Color.accent
    static let privacyGreen = AppleDS.Color.success
}

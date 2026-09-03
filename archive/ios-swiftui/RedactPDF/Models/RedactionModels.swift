import CoreGraphics
import Foundation
import SwiftUI

enum RedactionMode: String, CaseIterable, Identifiable {
    case smart = "AI Detect"
    case manual = "Manual Draw"

    var id: String { rawValue }
}

enum RedactionStyle: String, CaseIterable, Identifiable {
    case black = "Solid Black"
    case blur = "Gaussian Blur"
    case white = "Solid White"

    var id: String { rawValue }

    var previewColor: Color {
        switch self {
        case .black: return .black
        case .blur: return Color.gray.opacity(0.6)
        case .white: return .white
        }
    }
}

struct RedactionRect: Identifiable, Equatable {
    let id: UUID
    var pageIndex: Int
    var rect: CGRect
    var style: RedactionStyle

    init(id: UUID = UUID(), pageIndex: Int, rect: CGRect, style: RedactionStyle = .black) {
        self.id = id
        self.pageIndex = pageIndex
        self.rect = rect
        self.style = style
    }
}

struct LoadedPDFDocument: Identifiable, Equatable {
    let id = UUID()
    let url: URL
    let title: String

    static func == (lhs: LoadedPDFDocument, rhs: LoadedPDFDocument) -> Bool {
        lhs.id == rhs.id
    }
}

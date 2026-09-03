import SwiftUI

struct CanvasOverlayView: View {
    let redactions: [RedactionRect]
    let currentStyle: RedactionStyle
    let onRedactionAdded: (CGRect) -> Void

    @State private var dragOrigin: CGPoint?
    @State private var dragCurrent: CGPoint?

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                ForEach(redactions) { redaction in
                    redactionPreview(redaction, in: geometry.size)
                }

                if let origin = dragOrigin, let current = dragCurrent {
                    let rect = normalizedRect(from: origin, to: current, in: geometry.size)
                    redactionShape(for: currentStyle)
                        .frame(width: rect.width, height: rect.height)
                        .position(x: rect.midX, y: rect.midY)
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 4)
                    .onChanged { value in
                        if dragOrigin == nil {
                            dragOrigin = value.startLocation
                        }
                        dragCurrent = value.location
                    }
                    .onEnded { value in
                        let origin = dragOrigin ?? value.startLocation
                        let rect = normalizedRect(from: origin, to: value.location, in: geometry.size)
                        onRedactionAdded(rect)
                        dragOrigin = nil
                        dragCurrent = nil
                    }
            )
        }
    }

    private func redactionPreview(_ redaction: RedactionRect, in size: CGSize) -> some View {
        let rect = redaction.rect
        return redactionShape(for: redaction.style)
            .frame(width: rect.width, height: rect.height)
            .position(x: rect.midX, y: rect.midY)
    }

    @ViewBuilder
    private func redactionShape(for style: RedactionStyle) -> some View {
        switch style {
        case .black:
            Rectangle().fill(Color.black)
        case .white:
            Rectangle().fill(Color.white)
        case .blur:
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay(Rectangle().fill(SwiftUI.Color.black.opacity(0.12)))
        }
    }

    private func normalizedRect(from start: CGPoint, to end: CGPoint, in size: CGSize) -> CGRect {
        let x = min(start.x, end.x)
        let y = min(start.y, end.y)
        let width = abs(end.x - start.x)
        let height = abs(end.y - start.y)
        return CGRect(
            x: max(0, min(x, size.width)),
            y: max(0, min(y, size.height)),
            width: min(width, size.width),
            height: min(height, size.height)
        )
    }
}

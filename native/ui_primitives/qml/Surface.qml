import QtQuick
import QtQuick.Effects

Rectangle {
    id: root
    enum Variant { Canvas, Panel, Input, Overlay }
    property int variant: 1
    property bool selected: false
    property bool elevated: false
    layer.enabled: elevated
    layer.effect: MultiEffect {
        shadowEnabled: true
        shadowColor: Theme.scrimMedia
        shadowVerticalOffset: Metrics.md
        shadowBlur: 0.6
    }
    onVariantChanged: if (variant < 0 || variant > 3) { console.warn("Invalid surface variant"); variant = 1 }
    color: variant === 0 ? Theme.surfaceCanvas : variant === 2 ? Theme.surfaceInput : variant === 3 ? Theme.surfaceOverlay : Theme.surfacePanel
    radius: variant === 0 ? 0 : variant === 3 ? Metrics.radiusOverlay : Metrics.radiusCard
    border.width: variant === 0 ? 0 : Metrics.border
    border.color: selected ? Theme.borderFocus : Theme.borderSubtle
}

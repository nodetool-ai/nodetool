import QtQuick

Rectangle {
    id: root
    enum Variant {
        Canvas,
        Panel,
        Input,
        Overlay
    }
    property int variant: 1
    property bool selected: false
    property bool elevated: false
    Rectangle {
        z: -1
        visible: root.elevated && GraphicsInfo.api !== GraphicsInfo.Software
        anchors.fill: parent
        anchors.margins: -Metrics.xs
        anchors.topMargin: Metrics.xs
        anchors.bottomMargin: -Metrics.md
        color: Theme.scrimMedia
        opacity: 0.25
        radius: Metrics.radiusOverlay + Metrics.xs
    }
    onVariantChanged: if (variant < 0 || variant > 3) {
        console.warn("Invalid surface variant");
        variant = 1;
    }
    color: variant === 0 ? Theme.surfaceCanvas : variant === 2 ? Theme.surfaceInput : variant === 3 ? Theme.surfaceOverlay : Theme.surfacePanel
    radius: variant === 0 ? 0 : variant === 3 ? Metrics.radiusOverlay : Metrics.radiusCard
    border.width: variant === 0 ? 0 : Metrics.border
    border.color: selected ? Theme.borderFocus : Theme.borderSubtle
}

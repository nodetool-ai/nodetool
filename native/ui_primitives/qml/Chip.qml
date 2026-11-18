import QtQuick
import NodeTool.UiPrimitives as Ui

// A small read-only label. The scrim variant sits on media with light text. The tone variant
// sits on a control surface and takes its text color from `tone`. It hides itself when `text` is empty.
Rectangle {
    id: root
    enum Variant {
        Scrim,
        Tone
    }
    property string text: ""
    property int variant: Ui.Chip.Scrim
    property int tone: Ui.Text.Secondary
    // Overrides the text color of either variant.
    property var ink: undefined
    property real maximumWidth: Number.POSITIVE_INFINITY
    property int elide: Text.ElideRight
    visible: text.length > 0
    color: variant === Ui.Chip.Scrim ? Theme.scrimMedia : Theme.surfaceInput
    border.width: variant === Ui.Chip.Tone ? Metrics.border : 0
    border.color: Theme.borderSubtle
    radius: Metrics.radiusControl
    implicitWidth: Math.max(0, Math.min(label.implicitWidth + 2 * Metrics.md, maximumWidth))
    implicitHeight: label.implicitHeight + 2 * Metrics.xs
    width: implicitWidth
    height: implicitHeight
    Ui.Text {
        id: label
        x: Metrics.md
        anchors.verticalCenter: parent.verticalCenter
        width: Math.max(0, parent.width - 2 * Metrics.md)
        text: root.text
        role: Typography.SansCaption
        font.weight: Font.DemiBold
        elide: root.elide
        tone: root.variant === Ui.Chip.Scrim ? Ui.Text.OnAccent : root.tone
        domainColor: root.ink
    }
}

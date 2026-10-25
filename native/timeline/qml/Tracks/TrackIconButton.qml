// The 24 px icon button of TrackHeader.tsx (`iconButtonStyles`). Tones: idle
// and dim at rest, warning and success when the toggle is engaged.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: button
    property string icon
    property string label
    property string tone: "idle"
    readonly property bool engaged: tone === "warning" || tone === "success"
    readonly property color glyphColor: tone === "warning" ? Theme.warning
                                        : tone === "success" ? Theme.success
                                        : tone === "idle" ? (hover.hovered ? Theme.textPrimary : Theme.textSecondary)
                                        : (hover.hovered ? Theme.textPrimary : Theme.textDisabled)
    signal clicked()

    width: Theme.controlXs
    height: Theme.controlXs
    radius: Theme.radiusMd
    color: engaged ? Theme.actionSelected : hover.hovered ? Theme.actionHover : "transparent"
    border.width: 1
    border.color: hover.hovered ? Theme.divider : "transparent"

    Icon {
        visible: button.label === ""
        anchors.centerIn: parent
        path: button.icon
        size: Theme.iconXs
        color: button.glyphColor
    }
    Text {
        visible: button.label !== ""
        anchors.centerIn: parent
        text: button.label
        color: button.glyphColor
        font.family: Theme.monoFamily
        font.pixelSize: Theme.fontSizeSmall
        font.weight: Font.DemiBold
    }
    HoverHandler { id: hover; cursorShape: Qt.PointingHandCursor }
    TapHandler { onTapped: button.clicked() }
}

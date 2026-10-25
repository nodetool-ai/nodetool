// The step button of TimelineZoomControls.tsx (`stepButtonStyles`): 24 px,
// transparent border, a 13 px glyph in text.secondary.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: button
    property string icon
    property bool enabledState: true
    signal clicked()

    width: Theme.controlXs
    height: Theme.controlXs
    radius: Theme.radiusSm
    color: hover.hovered && enabledState ? Theme.actionHover : "transparent"
    border.width: 1
    border.color: "transparent"
    opacity: enabledState ? 1 : 0.4

    Icon {
        anchors.centerIn: parent
        path: button.icon
        size: Theme.fontSizeSmall
        color: hover.hovered && button.enabledState ? Theme.textPrimary : Theme.textSecondary
    }
    HoverHandler { id: hover; cursorShape: button.enabledState ? Qt.PointingHandCursor : Qt.ArrowCursor }
    TapHandler { onTapped: if (button.enabledState) button.clicked() }
}

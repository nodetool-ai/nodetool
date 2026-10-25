// ToolbarIconButton (ui_primitives/ToolbarIconButton.tsx), size small: a
// 28 px square with a 16 px glyph. Default text.secondary, primary in
// primary.main, active on action.selected.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: button
    property string icon
    property string variant: "default"
    property bool active: false
    property bool enabledState: true
    signal clicked()

    width: 28
    height: 28
    radius: Theme.radiusMd
    color: active ? Theme.actionSelected : hover.hovered && enabledState ? Theme.actionHover : "transparent"
    opacity: enabledState ? 1 : 0.38

    Icon {
        anchors.centerIn: parent
        path: button.icon
        size: Theme.iconSm
        color: button.active ? Theme.primary
               : button.variant === "primary" ? (hover.hovered ? "#5b86c4" : Theme.primary)
               : hover.hovered && button.enabledState ? Theme.textPrimary : Theme.textSecondary
    }
    HoverHandler { id: hover; cursorShape: button.enabledState ? Qt.PointingHandCursor : Qt.ArrowCursor }
    TapHandler { onTapped: if (button.enabledState) button.clicked() }
}

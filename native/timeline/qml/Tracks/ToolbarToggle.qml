// A labelled toggle of the timeline toolbar (the web's ToolbarIconButton with
// `active`): action.selected and primary text when on.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: toggle
    property string label
    property bool checked: false
    signal toggled()

    width: text.implicitWidth + 2 * Theme.spacingMd
    height: Theme.controlXs
    radius: Theme.radiusMd
    color: checked ? Theme.actionSelected : hover.hovered ? Theme.actionHover : "transparent"
    border.width: 1
    border.color: hover.hovered ? Theme.divider : "transparent"

    Text {
        id: text
        anchors.centerIn: parent
        text: toggle.label
        color: toggle.checked ? Theme.primary : hover.hovered ? Theme.textPrimary : Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        font.weight: Font.Medium
    }
    HoverHandler { id: hover; cursorShape: Qt.PointingHandCursor }
    TapHandler { onTapped: toggle.toggled() }
}

import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

Button {
    id: button
    property bool destructive: false
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    padding: Theme.spacingMd
    implicitHeight: Theme.toolbarHeight
    Accessible.name: text
    contentItem: Text {
        text: button.text
        color: !button.enabled ? Theme.textDisabled : button.destructive ? Theme.error : Theme.textPrimary
        font: button.font
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    background: Rectangle {
        color: button.down || button.checked ? Theme.actionSelected : button.hovered ? Theme.actionHover : Theme.backgroundPaper
        border.color: button.activeFocus ? Theme.primary : Theme.divider
        radius: Theme.radiusSm
    }
}

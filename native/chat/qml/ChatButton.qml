import QtQuick
import QtQuick.Controls

Button {
    id: root
    font.family: ChatTheme.sans
    font.pixelSize: ChatTheme.label
    leftPadding: ChatTheme.lg
    rightPadding: ChatTheme.lg
    implicitHeight: ChatTheme.control
    Accessible.name: text
    contentItem: Text {
        text: root.text
        color: root.enabled ? ChatTheme.text : ChatTheme.muted
        font: root.font
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
    }
    background: Rectangle {
        color: root.down || root.hovered ? ChatTheme.selected : ChatTheme.paper
        radius: ChatTheme.radius
        border.color: root.activeFocus ? ChatTheme.primary : ChatTheme.divider
        border.width: root.activeFocus ? 2 : 1
    }
}

import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
Button {
    id: root
    property bool destructive: false
    implicitHeight: InspectorTokens.controlSm
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    Accessible.name: text
    contentItem: Text {
        text: root.text
        font: root.font
        color: root.destructive ? Theme.error : Theme.textPrimary
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }
    background: Rectangle {
        radius: Theme.radiusSm
        color: root.destructive ? Theme.backgroundDefault : Theme.primary
        border.width: root.activeFocus || root.destructive ? Theme.spacingMicro / 2 : 0
        border.color: root.destructive ? Theme.error : Theme.textPrimary
    }
    opacity: enabled ? 1 : 0.5
}

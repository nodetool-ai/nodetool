import QtQuick
import QtQuick.Controls.Basic
import NodeTool.Timeline
Button {
    id: root
    property bool outlined: true
    implicitHeight: InspectorTokens.controlSm
    leftPadding: Theme.spacingMd
    rightPadding: Theme.spacingMd
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    background: Rectangle {
        radius: Theme.radiusSm
        color: root.hovered ? Theme.actionHover : "transparent"
        border.width: root.outlined ? 1 : 0
        border.color: Theme.overlayStrong
    }
    contentItem: Text {
        text: root.text
        font: root.font
        color: root.enabled ? Theme.textPrimary : Theme.textDisabled
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }
}

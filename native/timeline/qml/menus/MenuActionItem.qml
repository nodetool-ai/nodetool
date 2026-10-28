pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

MenuItem {
    id: entry
    required property ClipGestureController gestures
    required property string actionName
    required property var actionContext
    property string iconPath: ""
    property string shortcutText: ""
    property bool destructive: false
    height: Theme.rulerHeight
    leftPadding: Theme.spacingMd
    rightPadding: Theme.spacingMd
    contentItem: Row {
        spacing: Theme.spacingMd
        Icon {
            visible: entry.iconPath !== ""
            anchors.verticalCenter: parent.verticalCenter
            path: entry.iconPath
            size: Theme.iconSm
            color: entry.destructive ? Theme.error : Theme.textSecondary
        }
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: entry.text
            color: !entry.enabled ? Theme.textDisabled : entry.destructive ? Theme.error : Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
        }
        Text {
            anchors.verticalCenter: parent.verticalCenter
            visible: entry.shortcutText !== ""
            text: entry.shortcutText
            color: Theme.textSecondary
            font.family: Theme.monoFamily
            font.pixelSize: Theme.fontSizeSmaller
        }
    }
    background: Rectangle { color: entry.highlighted ? Theme.actionHover : "transparent"; radius: Theme.radiusSm }
    onTriggered: if (gestures) gestures.runAction(actionName, actionContext)
}

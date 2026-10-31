import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.Timeline

Basic.ScrollBar {
    id: control
    padding: Theme.spacingMicro
    implicitWidth: Theme.spacingSm + padding * 2
    implicitHeight: Theme.spacingSm + padding * 2
    contentItem: Rectangle {
        implicitWidth: Theme.spacingSm
        implicitHeight: Theme.spacingSm
        radius: Theme.radiusSm
        color: control.pressed ? Theme.textSecondary : control.hovered ? Theme.actionDisabled : Theme.overlayStrong
        opacity: control.size < 1 ? 1 : 0
    }
    background: Item {}
}

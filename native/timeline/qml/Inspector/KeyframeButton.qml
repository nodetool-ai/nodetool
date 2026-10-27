import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
Controls.ToolButton {
    id: root
    property bool active: false
    property string label: ""
    implicitWidth: Theme.controlXs
    implicitHeight: Theme.controlXs
    Accessible.name: label
    Controls.ToolTip.text: label
    Controls.ToolTip.visible: hovered
    contentItem: Text {
        text: root.text
        color: !root.enabled ? Theme.textDisabled : root.active ? Theme.primary : Theme.textSecondary
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        font.pixelSize: Theme.iconXs
    }
    background: Rectangle { color: root.hovered ? Theme.actionHover : "transparent"; radius: Theme.radiusSm }
}

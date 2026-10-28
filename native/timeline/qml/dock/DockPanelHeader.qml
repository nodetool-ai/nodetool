import QtQuick
import NodeTool.Timeline

// Optional toolbar beneath a panel's tabs, matching DockPanelHeader.tsx.
Item {
    id: root
    property string title: ""
    property string label: ""
    property alias controls: actions.data
    implicitHeight: label || actions.children.length ? Theme.toolbarHeight : 0
    Accessible.role: Accessible.ToolBar
    Accessible.name: title + " panel toolbar"
    Text {
        x: Theme.spacingSm
        anchors.verticalCenter: parent.verticalCenter
        text: root.label
        color: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
    }
    Row { id: actions; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; spacing: Theme.spacingMicro }
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.divider; visible: root.implicitHeight > 0 }
}

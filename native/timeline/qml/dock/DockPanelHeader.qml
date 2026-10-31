import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

// Optional toolbar beneath a panel's tabs, matching DockPanelHeader.tsx.
Item {
    id: root
    property string title: ""
    property string label: ""
    property alias controls: actions.data
    implicitHeight: label || actions.children.length ? Math.max(Ui.Metrics.comfortable,
        Ui.Typography.pixelSize(Ui.Typography.SansLabel) * Ui.Typography.lineHeight(Ui.Typography.SansLabel) + 2 * Ui.Metrics.md) : 0
    Accessible.role: Accessible.ToolBar
    Accessible.name: title + " panel toolbar"
    Ui.Text {
        x: Ui.Metrics.sm
        anchors.verticalCenter: parent.verticalCenter
        text: root.label
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
    }
    Row { id: actions; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; spacing: Ui.Metrics.micro }
    Ui.Separator { anchors.bottom: parent.bottom; width: parent.width; visible: root.implicitHeight > 0 }
}

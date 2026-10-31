import QtQuick
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    property int status: Ui.Status.Info
    property string message: ""
    property string actionText: ""
    signal actionTriggered()
    implicitWidth: statusView.implicitWidth + (action.visible ? action.implicitWidth + Metrics.md : 0) + Metrics.md * 2
    implicitHeight: row.implicitHeight + Metrics.md * 2
    radius: Metrics.radiusCard
    color: status === Ui.Status.Warning ? Theme.statusWarningSurface : status === Ui.Status.Error ? Theme.statusErrorSurface : Theme.surfacePanel
    border.width: Metrics.border
    border.color: Theme.borderSubtle
    Row {
        id: row
        anchors.fill: parent
        anchors.margins: Metrics.md
        spacing: Metrics.md
        Ui.Status { id: statusView; width: Math.max(0, row.width - (action.visible ? action.width + row.spacing : 0)); anchors.verticalCenter: parent.verticalCenter; status: root.status; message: root.message }
        Ui.EditorButton { id: action; objectName: "bannerActionButton"; anchors.verticalCenter: parent.verticalCenter; visible: root.actionText !== ""; text: root.actionText; onClicked: root.actionTriggered() }
    }
}

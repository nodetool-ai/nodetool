import QtQuick
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

// The status bar's Queue view (web/src/components/panels/jobs/QueuePanel.tsx):
// the bottom panel that lists the active jobs and the history at any time.
// It is the canvas QueueOverlay's list, docked: no drag, no collapse, and the
// header's button closes the panel.
Rectangle {
    id: root
    required property RunState runs
    property var resolver: null
    signal closeRequested()
    implicitWidth: Ui.Metrics.dialogCompactWidth * 2
    implicitHeight: Ui.Metrics.touch * 8
    color: Ui.Theme.surfacePanel
    QueueOverlay {
        objectName: "queue-panel-list"
        anchors.fill: parent
        docked: true
        runs: root.runs
        resolver: root.resolver
        onCloseRequested: root.closeRequested()
    }
}

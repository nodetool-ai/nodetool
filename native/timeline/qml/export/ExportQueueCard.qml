// The export queue: one row per export, running one at a time. A row keeps the
// reason when it fails, and the next one carries on. The card shows while the
// queue holds a row or a notice. ExportVideoDialog.qml hosts it.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: card
    objectName: "exportQueueCard"
    required property ExportQueue queue
    // A message about an export that could not be queued.
    property string notice: ""
    signal noticeDismissed()
    readonly property int finishedCount: queue.count - queue.activeCount

    visible: queue.count > 0 || notice.length > 0
    implicitHeight: column.implicitHeight + Ui.Metrics.lg * 2
    height: Math.min(implicitHeight, parent ? parent.height - y - Ui.Metrics.lg : implicitHeight)
    radius: Ui.Metrics.radiusCard
    color: Ui.Theme.surfacePanel
    border.width: Ui.Metrics.border
    border.color: Ui.Theme.borderControl
    clip: true

    ColumnLayout {
        id: column
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            Ui.Text {
                Layout.fillWidth: true
                text: "Exports"
                role: Ui.Typography.SansLabel
            }
            Ui.EditorButton {
                objectName: "clearFinishedButton"
                text: "Clear finished"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                visible: card.finishedCount > 0
                onClicked: card.queue.clearFinished()
            }
        }
        RowLayout {
            Layout.fillWidth: true
            visible: card.notice.length > 0
            Ui.Status {
                Layout.fillWidth: true
                objectName: "exportNotice"
                status: Ui.Status.Error
                message: card.notice
                wrap: true
            }
            Ui.EditorButton {
                text: "Dismiss"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                onClicked: card.noticeDismissed()
            }
        }
        ListView {
            id: list
            objectName: "exportQueueList"
            Layout.fillWidth: true
            Layout.preferredHeight: Math.min(contentHeight, Ui.Metrics.touch * 6)
            Layout.fillHeight: true
            visible: card.queue.count > 0
            clip: true
            interactive: contentHeight > height
            spacing: Ui.Metrics.md
            model: card.queue
            ScrollBar.vertical: Ui.ScrollBar {}
            delegate: ColumnLayout {
                id: row
                required property string jobId
                required property string fileName
                required property string presetName
                required property string formatLabel
                required property string state
                required property real ratio
                required property string detail
                required property string error
                objectName: "exportRow_" + jobId
                width: ListView.view.width - Ui.Metrics.lg
                spacing: Ui.Metrics.xs
                readonly property bool finished: state === "done" || state === "failed" || state === "cancelled"
                RowLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.md
                    Ui.Text {
                        Layout.fillWidth: true
                        text: row.fileName
                        elide: Text.ElideMiddle
                        role: Ui.Typography.SansLabel
                        tone: row.state === "cancelled" ? Ui.Text.Secondary : Ui.Text.Primary
                    }
                    Ui.Text {
                        visible: row.state === "running"
                        text: Math.round(row.ratio * 100) + "%"
                        role: Ui.Typography.MonoLabel
                        tone: Ui.Text.Secondary
                    }
                    Ui.EditorButton {
                        objectName: "cancelExport_" + row.jobId
                        visible: !row.finished
                        text: "Cancel"
                        density: Ui.EditorButton.Compact
                        onClicked: card.queue.cancel(row.jobId)
                    }
                    Ui.EditorButton {
                        objectName: "dismissExport_" + row.jobId
                        visible: row.finished
                        text: "Dismiss"
                        density: Ui.EditorButton.Compact
                        variant: Ui.EditorButton.Flat
                        onClicked: card.queue.remove(row.jobId)
                    }
                }
                Ui.Text {
                    Layout.fillWidth: true
                    visible: row.state !== "failed"
                    text: row.presetName.length > 0 ? row.presetName + " · " + row.detail : row.formatLabel + " · " + row.detail
                    elide: Text.ElideRight
                    role: Ui.Typography.SansCaption
                    tone: row.state === "done" ? Ui.Text.Success : Ui.Text.Secondary
                }
                Ui.Status {
                    Layout.fillWidth: true
                    visible: row.state === "failed"
                    status: Ui.Status.Error
                    message: row.error.length > 0 ? row.error : row.detail
                    wrap: true
                }
                Ui.Progress {
                    Layout.fillWidth: true
                    visible: row.state === "running"
                    value: row.ratio
                    accessibleName: "Export progress for " + row.fileName
                }
            }
        }
    }
}

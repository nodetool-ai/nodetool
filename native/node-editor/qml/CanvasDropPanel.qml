pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property var controller
    signal closeRequested()
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
    implicitWidth: Ui.Metrics.dialogCompactWidth
    implicitHeight: Ui.Metrics.dialogWidth
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            Ui.Text { text: "Canvas uploads"; role: Ui.Typography.SansTitle; Layout.fillWidth: true }
            Ui.EditorButton { objectName: "canvas-drop-close"; text: "Close"; onClicked: root.closeRequested() }
        }
        Ui.Text { visible: transfers.count === 0; text: "No pending canvas uploads."; role: Ui.Typography.SansBody; Layout.fillWidth: true; wrapMode: Text.Wrap }
        ListView {
            id: transfers
            objectName: "canvas-drop-transfers"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: Ui.Metrics.md
            model: root.controller.transfers
            delegate: ColumnLayout {
                id: transfer
                required property var modelData
                width: ListView.view.width
                spacing: Ui.Metrics.xs
                Ui.Text { text: transfer.modelData.name; role: Ui.Typography.SansLabel; Layout.fillWidth: true; wrapMode: Text.WrapAnywhere }
                Ui.Text { text: transfer.modelData.state === "uploading" ? "Uploading…" : transfer.modelData.state === "loading" ? "Loading asset…" : transfer.modelData.state === "cancelled" ? "Cancelled. No node was added." : transfer.modelData.error; role: Ui.Typography.SansCaption; Layout.fillWidth: true; wrapMode: Text.WrapAnywhere }
                Ui.Progress { Layout.fillWidth: true; visible: transfer.modelData.state === "uploading"; from: 0; to: Math.max(1, transfer.modelData.total); value: transfer.modelData.sent; accessibleName: "Upload " + transfer.modelData.name }
                RowLayout {
                    Ui.EditorButton { objectName: "canvas-drop-cancel-" + transfer.modelData.key; text: "Cancel"; visible: transfer.modelData.state === "uploading" || transfer.modelData.state === "loading"; onClicked: root.controller.cancel(transfer.modelData.key) }
                    Ui.EditorButton { objectName: "canvas-drop-retry-" + transfer.modelData.key; text: "Retry"; visible: transfer.modelData.state === "failed" || transfer.modelData.state === "cancelled"; onClicked: root.controller.retry(transfer.modelData.key) }
                }
                Ui.Separator { Layout.fillWidth: true }
            }
        }
    }
}

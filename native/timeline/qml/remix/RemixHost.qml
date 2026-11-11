// Hosts the Remix dialog and the notices of the Revert Remix action. RemixPanels.cpp
// registers it in the overlay slot. The key actions and the menus ask for the dialog
// through RemixSession.
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: host
    objectName: "remixHost"
    readonly property var editor: {
        var at = parent
        while (at && at.timeline === undefined) at = at.parent
        return at
    }
    readonly property var timeline: editor ? editor.timeline : null
    property string noticeTitle: ""
    property string noticeText: ""
    readonly property alias dialog: remixDialog
    readonly property alias remixController: controller

    function notify(title, text) {
        noticeTitle = title
        noticeText = text
        notice.open()
    }

    RemixController {
        id: controller
        objectName: "remixController"
        timeline: host.timeline
        onApplied: remixDialog.close()
        onReverted: (clipId, error) => { if (error !== "") host.notify("Could not revert the remix", error) }
    }
    Connections {
        target: RemixSession
        function onOpenRequested(clipId) { remixDialog.openFor(clipId) }
        function onRevertRequested(clipId) {
            const why = controller.revert(clipId)
            if (why !== "") host.notify("Could not revert the remix", why)
        }
        function onReported(title, text) { host.notify(title, text) }
    }
    RemixDialog {
        id: remixDialog
        controller: controller
    }
    Ui.Dialog {
        id: notice
        objectName: "remixNotice"
        title: host.noticeTitle
        width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width - Ui.Metrics.xl * 2 : Ui.Metrics.dialogCompactWidth)
        Column {
            width: parent.width
            spacing: Ui.Metrics.lg
            Ui.Text { width: parent.width; text: host.noticeText; wrapMode: Text.Wrap; role: Ui.Typography.SansBody }
            Ui.EditorButton {
                anchors.right: parent.right
                density: Ui.EditorButton.Compact
                text: "Close"
                onClicked: notice.close()
            }
        }
    }
}

// The window of `--music` (docs/MUSIC-MODE.md section 15, UI-5): the New
// music project dialog on its own. A created project is opened by the
// controller's openRequested, and Cancel ends the window.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "MusicProjectWindow"
    property var controller: null
    signal dismissed()
    width: Ui.Metrics.dialogCompactWidth + 2 * Ui.Metrics.xl
    height: Ui.Metrics.touch * 12
    color: Ui.Theme.surfaceCanvas

    function create(settings) {
        if (!controller) return
        if (!controller.projectId) controller.refresh()
        const created = controller.createMusicTimeline(settings)
        if (created.id) controller.openTimeline(created.id)
        else dialog.error = controller.error
    }
    Ui.EmptyState {
        anchors.centerIn: parent
        visible: !dialog.opened
        title: qsTr("New music project")
        message: root.controller && root.controller.error ? root.controller.error : ""
        actionText: qsTr("Start a music project")
        onActionTriggered: dialog.open()
    }
    NewMusicProjectDialog {
        id: dialog
        busy: root.controller ? root.controller.busy : false
        onCreateRequested: settings => root.create(settings)
        onCancelled: root.dismissed()
    }
    Component.onCompleted: {
        if (controller) controller.refresh()
        dialog.open()
    }
}

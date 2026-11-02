// Hosts the Edit Marker dialog and the CSV export file picker. MarkerPanels.cpp
// registers it in the overlay slot. The ruler, the
// Markers panel and the menus ask for them through MarkerSession.
import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtCore
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: host
    objectName: "markerEditHost"
    readonly property var editor: {
        var at = parent
        while (at && at.timeline === undefined) at = at.parent
        return at
    }
    readonly property var timeline: editor ? editor.timeline : null
    property string exportError: ""
    readonly property alias editDialog: dialog

    function suggestedFile() {
        let name = timeline ? timeline.name.trim().replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") : ""
        if (!name) name = "timeline"
        return StandardPaths.writableLocation(StandardPaths.DocumentsLocation) + "/" + name + "-markers.csv"
    }

    Connections {
        target: MarkerSession
        function onEditRequested(id) { dialog.openFor(id) }
        function onExportRequested() {
            if (!host.timeline || host.timeline.markers.length === 0) return
            saveFile.currentFile = host.suggestedFile()
            saveFile.open()
        }
    }
    MarkerEditDialog {
        id: dialog
        timeline: host.timeline
    }
    FileDialog {
        id: saveFile
        title: "Export markers"
        fileMode: FileDialog.SaveFile
        nameFilters: ["CSV (*.csv)"]
        defaultSuffix: "csv"
        onAccepted: {
            host.exportError = MarkerSession.saveCsv(host.timeline.markers, host.timeline.fps, selectedFile)
            if (host.exportError !== "") failure.open()
        }
    }
    Ui.Dialog {
        id: failure
        objectName: "markerExportError"
        title: "Could not export markers"
        width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width - Ui.Metrics.xl * 2 : Ui.Metrics.dialogCompactWidth)
        Column {
            width: parent.width
            spacing: Ui.Metrics.lg
            Ui.Text { width: parent.width; text: host.exportError; wrapMode: Text.Wrap; role: Ui.Typography.SansBody }
            Ui.EditorButton {
                anchors.right: parent.right
                density: Ui.EditorButton.Compact
                text: "Close"
                onClicked: failure.close()
            }
        }
    }
}

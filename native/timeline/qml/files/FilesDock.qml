// nt-panel: slot=left id=files order=5 title="Files"
import QtQuick
import NodeTool.Timeline
import NodeTool.Files
import NodeTool.UiPrimitives as Ui
import "../assets/AssetContext.js" as Context

// The tree of the open timeline's project folder, from the shared
// NodeTool.Files package that the node editor's Files dock uses too. The dock
// tab closes it, so the panel shows no close button of its own.
Item {
    id: host
    objectName: "projectFilesDock"
    implicitWidth: Ui.Metrics.panelWidth
    readonly property bool docked: !!parent && !!parent.dock
    width: docked ? parent.width : implicitWidth
    height: docked ? parent.height : parent && parent.parent ? parent.parent.height : TimelineMetrics.trackHeight * 9
    TimelineProjectFiles { id: source }
    FilesPanel {
        anchors.fill: parent
        files: source.files
        closable: false
    }
    Component.onCompleted: Qt.callLater(() => {
        const editor = Context.editorFor(host)
        if (editor) {
            source.folder = editor.projectFolder || null
            source.autosave = editor.saver || null
        }
    })
}

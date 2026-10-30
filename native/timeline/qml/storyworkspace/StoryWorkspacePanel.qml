// nt-panel: slot=left id=script order=35 title="Scripts"
import QtQuick
import NodeTool.Timeline
import "../assets/AssetContext.js" as Context

Rectangle {
    id: panel
    objectName: "timelineScriptPanel"
    color: Theme.backgroundDefault
    property var timeline: null
    function openResource(id) { editor.openResource(id, "scripts") }
    AssistController { id: documents; timeline: panel.timeline; documentOnly: true }
    StoryWorkspace { id: drafts; objectName: "scriptDrafts"; controller: documents }
    AssetBrowser { id: media; timeline: panel.timeline }
    StoryWorkspaceEditor {
        id: editor
        anchors.fill: parent
        controller: documents
        workspace: drafts
        mediaBrowser: media
        fixedKind: "scripts"
        onLinkedResourceRequested: (kind, id) => {
            const host = Context.editorFor(panel)
            if (host) host.openStoryResource(kind, id)
        }
    }
    Component.onCompleted: Qt.callLater(() => {
        const host = Context.editorFor(panel)
        if (host) panel.timeline = host.timeline
        if (panel.timeline) editor.browse("scripts")
    })
}

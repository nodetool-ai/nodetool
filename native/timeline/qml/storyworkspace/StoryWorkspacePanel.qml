// nt-panel: slot=left id=script order=35 title="Scripts & storyboards"
import QtQuick
import NodeTool.Timeline
import "../assets/AssetContext.js" as Context

Rectangle {
    id: panel
    objectName: "storyWorkspacePanel"
    color: Theme.backgroundDefault
    property var timeline: null
    AssistController { id: documents; timeline: panel.timeline; documentOnly: true }
    StoryWorkspace { id: drafts; controller: documents }
    AssetBrowser { id: media; timeline: panel.timeline }
    StoryWorkspaceEditor {
        id: editor
        anchors.fill: parent
        controller: documents
        workspace: drafts
        mediaBrowser: media
    }
    Component.onCompleted: Qt.callLater(() => {
        const host = Context.editorFor(panel)
        if (host) panel.timeline = host.timeline
        if (panel.timeline) editor.browse("scripts")
    })
}

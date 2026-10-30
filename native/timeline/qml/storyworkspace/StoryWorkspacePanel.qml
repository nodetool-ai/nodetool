// nt-panel: slot=left id=script order=35 title="Story workspace"
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "../aiassist"
Rectangle {
    id: panel
    color: Theme.backgroundDefault
    property alias timeline: production.timeline
    Column {
        anchors.fill: parent
        spacing: Theme.spacingSm
        TabBar {
            id: tabs
            palette.button: Theme.backgroundPaper
            palette.buttonText: Theme.textPrimary
            palette.windowText: Theme.textPrimary
            width: parent.width
            onCurrentIndexChanged: {
                if (!production || !production.documentController) return
                const resource = production.documentController.result || ({})
                if (currentIndex === 1) production.documentKind = resource.document?.shots !== undefined ? "storyboards" : "scripts"
                else editor.kind = resource.document?.shots !== undefined ? "storyboards" : resource.document?.sections !== undefined ? "scripts" : resource.metadata?.nodetool_entity !== undefined ? "entities" : production.documentKind
            }
            TabButton { text: "Workspace" }
            TabButton { text: "Production"; enabled: !drafts.dirty && !production.documentController.scriptDirty }
        }
        StoryWorkspaceEditor {
            id: editor
            width: parent.width
            height: parent.height - tabs.height - parent.spacing
            visible: tabs.currentIndex === 0
            controller: production.documentController
            workspace: drafts
            onReferenceRequested: assetId => { production.previewReference(assetId); tabs.currentIndex = 1 }
            onProductionRequested: tabs.currentIndex = 1
        }
        TimelineScriptPanel {
            id: production
            width: parent.width
            height: parent.height - tabs.height - parent.spacing
            visible: tabs.currentIndex === 1
            workspaceMode: true
        }
    }
    StoryWorkspace { id: drafts; controller: production.documentController }
}

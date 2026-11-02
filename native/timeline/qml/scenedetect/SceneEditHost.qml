// Hosts the Scene Edit Detection dialog. SceneEditPanels.cpp registers it in the
// overlay slot. The Clip menu and the key action ask for it through SceneEditSession.
import QtQuick
import NodeTool.Timeline

Item {
    id: host
    objectName: "sceneEditHost"
    readonly property var editor: {
        var at = parent
        while (at && at.timeline === undefined) at = at.parent
        return at
    }
    readonly property var timeline: editor ? editor.timeline : null
    readonly property alias dialog: scene

    Connections {
        target: SceneEditSession
        function onOpenRequested(clipIds) { scene.openFor(clipIds) }
    }
    SceneEditDialog {
        id: scene
        timeline: host.timeline
    }
}

// nt-panel: slot=overlay id=musicMode order=5 title="Music mode"
// Opens a music sequence in music mode (docs/MUSIC-MODE.md MD3, UI-4): the
// Music workspace, the ruler in bars with bar snapping, and the Range tool.
// A sequence with no `music` object leaves the Music workspace for Editing
// and the Range tool for Select, so a video sequence opens as it always has.
// While the Music workspace shows a sequence with no video track, the
// program monitor is left out.
// Nothing here draws or takes pointer input.
import QtQuick
import NodeTool.Timeline

Item {
    id: root
    objectName: "musicMode"
    property var editor: null
    property var gestures: null
    readonly property var store: editor && editor.dockStore !== undefined ? editor.dockStore : null
    readonly property bool hidesProgram: !!store && store.workspace === "Music" && sequence.isMusic && !sequence.hasVideoTrack
    // Counts the times this editor opened a sequence in music mode.
    property int applied: 0

    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined && item.dockStore !== undefined) return item
            item = item.parent
        }
        return null
    }
    function findGestures(item) {
        if (!item) return null
        if (item.gestures !== undefined && item.gestures !== null) return item.gestures
        const children = item.children || []
        for (let i = 0; i < children.length; ++i) {
            const found = findGestures(children[i])
            if (found) return found
        }
        return null
    }
    function attach() {
        editor = editorAbove()
        gestures = findGestures(editor)
        if (gestures) apply()
    }
    function apply() {
        if (!store || !gestures) return
        if (sequence.isMusic) {
            const index = store.workspaces.indexOf("Music")
            if (store.workspace !== "Music" && index >= 0) store.switchWorkspace(index)
            gestures.viewState.rulerMode = "bars"
            gestures.viewState.gridDivision = "bar"
            gestures.activeTool = "range"
            ++applied
        } else {
            if (store.workspace === "Music") store.switchWorkspace(Math.max(0, store.workspaces.indexOf("Editing")))
            if (gestures.activeTool === "range") gestures.activeTool = "select"
        }
    }
    MusicSequenceState {
        id: sequence
        timeline: root.editor ? root.editor.timeline : null
        onDocumentOpened: root.apply()
    }
    // The tracks panel can arrive after this overlay. Try for a few seconds, then stop.
    Timer {
        id: attachRetry
        property int attempts: 0
        interval: 50
        repeat: true
        running: !root.gestures && attempts < 100
        onTriggered: { ++attempts; root.attach() }
    }
    Component.onCompleted: Qt.callLater(attach)
    Binding {
        target: root.editor ? root.editor.dockCanvas : null
        property: "suppressedIds"
        value: root.hidesProgram ? ["program"] : []
        when: !!root.editor && root.editor.dockCanvas !== undefined
    }
}

// nt-panel: slot=overlay id=musicToast order=40 title="Music toast"
// Confirms a placed music result (docs/MUSIC-MODE.md section 9, the music mode
// mockup): "4 takes added. Take A1 is active." It listens to the timeline's
// MusicJobs (MusicJobsRegistry), so it reports jobs whatever panel is shown,
// and takes no pointer input.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "MusicLayout.js" as MusicLayout

Item {
    id: root
    objectName: "musicToastHost"
    property var editor: null
    readonly property var jobs: editor && editor.timeline ? MusicJobsRegistry.forTimeline(editor.timeline) : null

    function message(count, activeLabel) {
        const added = count === 1 ? qsTr("1 take added.") : qsTr("%1 takes added.").arg(count)
        return activeLabel !== "" ? added + " " + qsTr("%1 is active.").arg(activeLabel) : added
    }
    function attach() { editor = MusicLayout.editorOf(root) }
    Component.onCompleted: attach()
    Timer {
        interval: 50
        repeat: true
        running: !root.editor
        onTriggered: root.attach()
    }
    Connections {
        target: root.jobs
        function onTakesPlaced(jobId, count, activeLabel) { toast.show(root.message(count, activeLabel)) }
    }
    Ui.Toast {
        id: toast
        objectName: "musicToast"
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: Ui.Metrics.xxxl
        width: Math.min(implicitWidth, root.width - 2 * Ui.Metrics.lg)
    }
}

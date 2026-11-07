// A press that lifts the marked Source range. `video` and `audio` choose the
// streams it places. The range is captured when the drag starts. With
// `horizontalScrub`, a mostly horizontal drag scrubs and a vertical one lifts.
import QtQuick
import NodeTool.Timeline

MouseArea {
    id: area
    property bool video: true
    property bool audio: false
    property bool horizontalScrub: false
    signal scrubbed(real x)
    signal tapped(real x)
    signal scrubCanceled()

    readonly property bool lifting: point.Drag.active
    // Read by AssetDropOverlay through Drag.source. A lift keeps what it took,
    // whatever Source shows by the time it lands.
    property var sourceStreams: ({ video: false, audio: false })
    property var sourceRange: ({})
    // "", "lift", "scrub", or "canceled" until the press ends.
    property string gesture: ""
    property real pressX: 0
    property real pressY: 0

    function cancelGesture() {
        if (gesture === "scrub") {
            gesture = "canceled"
            area.scrubCanceled()
            return true
        }
        if (!point.Drag.active) return false
        point.Drag.cancel()
        point.Drag.active = false
        gesture = "canceled"
        return true
    }

    preventStealing: true
    cursorShape: lifting ? Qt.ClosedHandCursor : Qt.OpenHandCursor
    Item {
        id: point
        width: 1
        height: 1
        Drag.keys: ["application/x-nodetool-asset"]
        Drag.source: area
        Drag.supportedActions: Qt.CopyAction
        Drag.proposedAction: Qt.CopyAction
    }
    onPressed: mouse => {
        pressX = mouse.x
        pressY = mouse.y
        point.x = mouse.x
        point.y = mouse.y
        gesture = ""
    }
    onPositionChanged: mouse => {
        if (!pressed) return
        point.x = mouse.x
        point.y = mouse.y
        if (gesture === "") {
            const dx = Math.abs(mouse.x - pressX)
            const dy = Math.abs(mouse.y - pressY)
            if (Math.max(dx, dy) < Qt.styleHints.startDragDistance) return
            gesture = horizontalScrub && dx >= dy ? "scrub" : "lift"
            if (gesture === "lift") {
                sourceStreams = { video: area.video, audio: area.audio }
                sourceRange = SourceViewerState.captureRange()
                point.Drag.active = true
            }
        }
        if (gesture === "scrub") area.scrubbed(mouse.x)
    }
    onReleased: mouse => {
        if (gesture === "") area.tapped(mouse.x)
        if (point.Drag.active) {
            point.x = mouse.x
            point.y = mouse.y
            point.Drag.drop()
            point.Drag.active = false
        }
        gesture = ""
    }
    onCanceled: {
        cancelGesture()
        gesture = ""
    }
}

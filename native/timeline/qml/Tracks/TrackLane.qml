// Mirrors web/src/components/timeline/Tracks/TrackLane.tsx: one row of
// clips. Its LaneClipModel holds only the clips inside the view state's clip
// window plus the clip under a gesture (D28), so the lane instantiates a few
// Clip items however long the track is. A press on the empty lane parks the
// playhead there, clamped to the sequence.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: lane
    required property string trackId
    required property string trackType
    required property bool trackVisible
    required property bool locked
    required property bool muted
    required property double rowHeight
    required property TimelineModel timeline
    required property PlaybackClock clock
    required property TimelineViewState viewState
    required property ClipGestureController gestures

    readonly property alias clipModel: clips
    readonly property bool mutedSoundTrack: (trackType === "audio" || trackType === "midi") && muted

    objectName: "trackLane-" + trackId
    height: rowHeight
    color: Theme.backgroundDefault
    opacity: trackVisible ? 1 : 0.55
    clip: true

    LaneClipModel {
        id: clips
        timeline: lane.timeline
        trackId: lane.trackId
        viewState: lane.viewState
        // The clip under a gesture stays while it is outside the window (D28).
        pinnedClipId: lane.gestures ? lane.gestures.activeClipId : ""
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onPressed: mouse => {
            if (mouse.button === Qt.RightButton) {
                if (lane.locked) return
                laneMenu.context = { trackId: lane.trackId, timeMs: Math.max(0, mouse.x * lane.viewState.msPerPx), editable: true }
                laneMenu.popup(mouse.x, mouse.y)
                return
            }
            const atMs = Math.max(0, mouse.x * lane.viewState.msPerPx)
            // Under a track select tool the press selects the block.
            if (lane.gestures && lane.gestures.pressLane(lane.trackId, atMs, mouse.modifiers)) return
            // A press on the empty lane starts a marquee in the web, which
            // replaces the selection with what it covers: nothing yet.
            if (lane.gestures) lane.gestures.selection = []
            const endMs = lane.timeline.durationMs
            const t = Math.max(0, mouse.x * lane.viewState.msPerPx)
            lane.clock.seek(endMs > 0 ? Math.min(endMs, t) : t)
        }
    }

    RegistryContextMenu {
        id: laneMenu
        kind: "lane"
        gestures: lane.gestures
    }

    Repeater {
        model: clips
        delegate: Clip {
            laneHeight: lane.height
            trackLocked: lane.locked
            mutedTrack: lane.mutedSoundTrack
            viewState: lane.viewState
            gestures: lane.gestures
        }
    }

    // borderBottom: 1px divider.
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.divider
    }
}

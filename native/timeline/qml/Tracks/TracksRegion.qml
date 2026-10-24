// Mirrors web/src/components/timeline/Tracks/TracksRegion.tsx: the track
// header column on the left, the ruler on top, the lanes under it, and the
// playhead over the ruler and lanes.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: region
    required property TimelineModel timeline
    required property PlaybackClock clock

    // Zoom. TimelineZoomControls writes it.
    property real pxPerMs: 0.06
    readonly property real contentWidth: timeline.durationMs * pxPerMs + 200

    function fit() {
        pxPerMs = Math.max(0.005, (lanes.width - 24) / Math.max(1, timeline.durationMs))
    }

    color: Theme.background
    clip: true

    // Corner above the header column.
    Rectangle {
        id: corner
        width: Theme.trackHeaderWidth
        height: Theme.rulerHeight
        color: Theme.panel
        Text {
            anchors.verticalCenter: parent.verticalCenter
            x: 12
            text: "Tracks"
            color: Theme.textMuted
            font.pixelSize: 11
        }
    }

    TimeRuler {
        id: ruler
        anchors.left: corner.right
        anchors.right: parent.right
        height: Theme.rulerHeight
        pxPerMs: region.pxPerMs
        contentX: lanes.contentX
        durationMs: region.timeline.durationMs
        onSeekRequested: ms => region.clock.seek(ms)
    }

    // Headers scroll vertically with the lanes.
    ListView {
        id: headers
        anchors.top: corner.bottom
        anchors.bottom: parent.bottom
        width: Theme.trackHeaderWidth
        interactive: false
        contentY: lanes.contentY
        model: region.timeline.tracks
        delegate: TrackHeader {
            width: headers.width
        }
    }

    Flickable {
        id: lanes
        anchors.top: ruler.bottom
        anchors.left: headers.right
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        contentWidth: region.contentWidth
        contentHeight: laneColumn.height
        boundsBehavior: Flickable.StopAtBounds
        clip: true

        Column {
            id: laneColumn
            Repeater {
                model: region.timeline.tracks
                delegate: TrackLane {
                    width: region.contentWidth
                    pxPerMs: region.pxPerMs
                }
            }
        }
    }

    Playhead {
        anchors.top: ruler.top
        anchors.bottom: parent.bottom
        x: lanes.x + region.clock.time * region.pxPerMs - lanes.contentX
        visible: x >= lanes.x - 1 && x <= region.width
    }
}

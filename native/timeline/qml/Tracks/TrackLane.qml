// Mirrors web/src/components/timeline/Tracks/TrackLane.tsx: one row of clips.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: lane
    required property int index
    required property string trackType
    required property var clips
    property real pxPerMs: 0.06

    height: Theme.trackHeight
    color: index % 2 === 0 ? Theme.lane : Theme.laneAlt

    Repeater {
        model: lane.clips
        delegate: Clip {
            required property var modelData
            clipName: modelData.name
            clipHidden: modelData.hidden
            color: Theme.clipColor(lane.trackType)
            x: modelData.startMs * lane.pxPerMs
            width: Math.max(2, modelData.durationMs * lane.pxPerMs)
            y: 4
            height: lane.height - 8
        }
    }

    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.divider
    }
}

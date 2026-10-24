// Mirrors web/src/components/timeline/Tracks/Playhead.tsx. The parent binds x
// to PlaybackClock.time, so playback moves this item and nothing else.
import QtQuick
import NodeTool.Timeline

Item {
    width: 1
    Rectangle {
        x: -5
        width: 11
        height: 10
        radius: 2
        color: Theme.playhead
    }
    Rectangle {
        width: 1
        height: parent.height
        color: Theme.playhead
    }
}

import QtQuick
import NodeTool.Timeline

// The dock slot owns the height, as TimelineTracksPanel.tsx does on the web.
Item {
    id: root
    required property TimelineModel timeline
    required property PlaybackClock clock
    readonly property alias gestures: tracks.gestures
    signal shortcutsRequested()
    Keys.forwardTo: [tracks]
    TracksRegion {
        id: tracks
        anchors.fill: parent
        timeline: root.timeline
        clock: root.clock
        onShortcutsRequested: root.shortcutsRequested()
    }
}

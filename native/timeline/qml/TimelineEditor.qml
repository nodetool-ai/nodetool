// Mirrors web/src/components/timeline/TimelineEditor.tsx: the preview with
// its transport on top, the tracks region under it.
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline

Rectangle {
    id: root
    required property TimelineModel timeline
    required property PlaybackClock clock

    color: Theme.backgroundDefault
    focus: true
    Keys.onSpacePressed: root.clock.toggle()
    Keys.forwardTo: [tracksRegion]

    // Samples the monotonic clock into clock.time once per frame while playing.
    FrameAnimation {
        running: root.clock.playing
        onTriggered: root.clock.tick()
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        PreviewArea {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: root.height * 0.55
            timeline: root.timeline
            clock: root.clock
        }

        TracksRegion {
            id: tracksRegion
            Layout.fillWidth: true
            Layout.preferredHeight: root.height * 0.45
            timeline: root.timeline
            clock: root.clock
        }
    }
}

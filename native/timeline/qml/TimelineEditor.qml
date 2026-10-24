// Mirrors web/src/components/timeline/TimelineEditor.tsx: preview on top, the
// transport bar, then the tracks region.
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic
import NodeTool.Timeline

Rectangle {
    id: root
    required property TimelineModel timeline
    required property PlaybackClock clock

    color: Theme.background
    focus: true
    Keys.onSpacePressed: root.clock.toggle()

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

        Rectangle {
            id: transport
            Layout.fillWidth: true
            Layout.preferredHeight: 40
            color: Theme.panel

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12
                spacing: 12

                Button {
                    text: root.clock.playing ? "Pause" : "Play"
                    focusPolicy: Qt.NoFocus
                    onClicked: root.clock.toggle()
                }
                Text {
                    color: Theme.text
                    font.family: "Menlo"
                    font.pixelSize: 13
                    text: Theme.timecode(root.clock.time, root.timeline.fps) + " / "
                          + Theme.timecode(root.timeline.durationMs, root.timeline.fps)
                }
                Item { Layout.fillWidth: true }
                Text {
                    color: Theme.textMuted
                    font.pixelSize: 12
                    text: root.timeline.name + " · " + root.timeline.canvasWidth + "×"
                          + root.timeline.canvasHeight + " @ " + root.timeline.fps + " fps"
                }
                TimelineZoomControls {
                    region: tracksRegion
                }
            }
        }

        TracksRegion {
            id: tracksRegion
            Layout.fillWidth: true
            Layout.preferredHeight: root.height * 0.4
            timeline: root.timeline
            clock: root.clock
        }
    }
}

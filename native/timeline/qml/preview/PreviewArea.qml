// Mirrors web/src/components/timeline/preview/PreviewArea.tsx: the
// compositor, letterboxed to the canvas aspect ratio, over the transport bar
// (start, frame back, play, stop, loop, frame forward, end, the timecode, the
// scrubber, the duration and the fps). The quality select, volume, matte and
// fullscreen controls are not part of the prototype.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: area
    required property TimelineModel timeline
    required property PlaybackClock clock

    color: Theme.backgroundDefault
    clip: true

    readonly property real canvasAspect: timeline.canvasWidth / timeline.canvasHeight
    readonly property double frameMs: 1000 / Math.max(1, timeline.fps)

    Item {
        id: viewport
        width: parent.width
        height: parent.height - controlBar.height

        Item {
            id: frame
            objectName: "previewFrame"
            clip: true
            anchors.centerIn: parent
            width: Math.min(viewport.width - 16, (viewport.height - 16) * area.canvasAspect)
            height: width / area.canvasAspect
            PreviewCompositor {
                objectName: "previewCompositor"
                anchors.fill: parent
                timeline: area.timeline
                clock: area.clock
            }
            SlotItems {
                anchors.fill: parent
                slot: "preview"
                overlay: true
                slotProperties: ({ timeline: area.timeline, clock: area.clock })
            }
        }
    }

    // The control bar: 36 px, paper, a top rule, 2 px padding and gap.
    Rectangle {
        id: controlBar
        objectName: "transportBar"
        y: parent.height - height
        width: parent.width
        height: Theme.transportHeight
        color: Theme.backgroundPaper
        Rectangle {
            width: parent.width
            height: 1
            color: Theme.divider
        }

        Row {
            id: buttons
            x: Theme.spacingMicro
            anchors.verticalCenter: parent.verticalCenter
            spacing: Theme.spacingMicro
            TransportButton {
                icon: Icons.skipPrevious
                onClicked: area.clock.seek(0)
            }
            TransportButton {
                icon: Icons.navigateBefore
                enabledState: !area.clock.playing
                onClicked: area.clock.seek(Math.max(0, area.clock.time - area.frameMs))
            }
            TransportButton {
                objectName: "transportPlay"
                icon: area.clock.playing ? Icons.pause : Icons.playArrow
                variant: "primary"
                onClicked: area.clock.toggle()
            }
            TransportButton {
                icon: Icons.stop
                onClicked: {
                    area.clock.pause()
                    area.clock.seek(0)
                }
            }
            TransportButton {
                icon: Icons.repeat
                active: area.clock.loop
                onClicked: area.clock.loop = !area.clock.loop
            }
            TransportButton {
                icon: Icons.navigateNext
                enabledState: !area.clock.playing
                onClicked: area.clock.seek(Math.min(area.timeline.contentEndMs, area.clock.time + area.frameMs))
            }
            TransportButton {
                icon: Icons.skipNext
                onClicked: area.clock.seek(area.timeline.contentEndMs)
            }
            Text {
                objectName: "transportTimecode"
                anchors.verticalCenter: parent.verticalCenter
                leftPadding: Theme.spacingXs
                text: TimelineFormat.playheadTimecode(area.clock.time, area.timeline.fps)
                color: Theme.textSecondary
                font.family: Theme.monoFamily
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Font.Medium
            }
        }

        // The scrubber fills the rest; 12 px padding each side.
        CompactSlider {
            id: scrubber
            objectName: "transportScrubber"
            x: buttons.x + buttons.width + Theme.spacingMicro + Theme.spacingLg
            width: Math.max(32, trailing.x - Theme.spacingMicro - Theme.spacingLg - x)
            anchors.verticalCenter: parent.verticalCenter
            from: 0
            to: Math.max(1, area.timeline.contentEndMs)
            value: area.clock.time
            onMoved: area.clock.seek(value)
        }

        Row {
            id: trailing
            x: parent.width - width - Theme.spacingMd
            anchors.verticalCenter: parent.verticalCenter
            spacing: Theme.spacingMd
            Text {
                text: "/" + TimelineFormat.playheadTimecode(area.timeline.contentEndMs, area.timeline.fps)
                color: Theme.textSecondary
                font.family: Theme.monoFamily
                font.pixelSize: Theme.fontSizeSmaller
            }
            Text {
                text: area.timeline.fps + " fps"
                color: Theme.textSecondary
                font.family: Theme.monoFamily
                font.pixelSize: Theme.fontSizeSmaller
            }
        }
    }
}

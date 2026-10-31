// Mirrors web/src/components/timeline/preview/PreviewArea.tsx: the
// compositor, letterboxed to the canvas aspect ratio, over the transport bar
// (start, frame back, play, stop, loop, frame forward, end, the timecode, the
// scrubber, the duration and the fps). The quality select, volume, matte and
// fullscreen controls are not part of the prototype.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: area
    required property TimelineModel timeline
    required property PlaybackClock clock

    color: Ui.Theme.surfaceCanvas
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
        height: TimelineMetrics.transportHeight
        color: Ui.Theme.surfacePanel
        Rectangle {
            width: parent.width
            height: 1
            color: Ui.Theme.borderSubtle
        }

        Row {
            id: buttons
            x: Ui.Metrics.micro
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.micro
            Ui.ToolbarIconButton {
                iconName: "skipPrevious"
                accessibleName: "Go to start"
                onClicked: area.clock.seek(0)
            }
            Ui.ToolbarIconButton {
                iconName: "navigateBefore"
                accessibleName: "Previous frame"
                enabled: !area.clock.playing
                onClicked: area.clock.seek(Math.max(0, area.clock.time - area.frameMs))
            }
            Ui.ToolbarIconButton {
                objectName: "transportPlay"
                iconName: area.clock.playing ? "pause" : "playArrow"
                accessibleName: area.clock.playing ? "Pause" : "Play"
                variant: Ui.EditorButton.Primary
                onClicked: area.clock.toggle()
            }
            Ui.ToolbarIconButton {
                iconName: "stop"
                accessibleName: "Stop"
                onClicked: {
                    area.clock.pause()
                    area.clock.seek(0)
                }
            }
            Ui.ToolbarIconButton {
                iconName: "repeat"
                active: area.clock.loop
                Accessible.checkable: true
                Accessible.checked: area.clock.loop
                accessibleName: "Loop playback"
                onClicked: area.clock.loop = !area.clock.loop
            }
            Ui.ToolbarIconButton {
                iconName: "navigateNext"
                accessibleName: "Next frame"
                enabled: !area.clock.playing
                onClicked: area.clock.seek(Math.min(area.timeline.contentEndMs, area.clock.time + area.frameMs))
            }
            Ui.ToolbarIconButton {
                iconName: "skipNext"
                accessibleName: "Go to end"
                onClicked: area.clock.seek(area.timeline.contentEndMs)
            }
            Ui.Text {
                objectName: "transportTimecode"
                anchors.verticalCenter: parent.verticalCenter
                x: Ui.Metrics.xs
                text: TimelineFormat.playheadTimecode(area.clock.time, area.timeline.fps)
                role: Ui.Typography.MonoLabel
                tone: Ui.Text.Secondary
            }
        }

        // The scrubber fills the rest; 12 px padding each side.
        Ui.Slider {
            id: scrubber
            objectName: "transportScrubber"
            property real gestureBaseline: 0
            x: buttons.x + buttons.width + Ui.Metrics.micro + Ui.Metrics.lg
            width: Math.max(Ui.Metrics.standard, trailing.x - Ui.Metrics.micro - Ui.Metrics.lg - x)
            anchors.verticalCenter: parent.verticalCenter
            from: 0
            to: Math.max(1, area.timeline.contentEndMs)
            value: area.clock.time
            onEditStarted: gestureBaseline = area.clock.time
            onValuePreviewed: value => area.clock.seek(value)
            onValueCommitted: value => area.clock.seek(value)
            onEditCanceled: area.clock.seek(gestureBaseline)
            accessibleName: "Playhead position"
            density: Ui.EditorButton.Compact
        }

        Row {
            id: trailing
            x: parent.width - width - Ui.Metrics.md
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.md
            Ui.Text {
                text: "/" + TimelineFormat.playheadTimecode(area.timeline.contentEndMs, area.timeline.fps)
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
            }
            Ui.Text {
                text: area.timeline.fps + " fps"
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
            }
        }
    }
}

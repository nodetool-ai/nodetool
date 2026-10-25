// Mirrors web/src/components/timeline/Tracks/TracksRegion.tsx:
//
//   toolbar                                   (36 px, zoom controls)
//   TRACKS header | TimeRuler                 (28 px)
//   TrackHeader   | TrackLane  ...            (the rows, virtualized)
//   TimelineScrollbar                         (14 px)
//   Playhead over the ruler and the lanes
//
// Rows: a TrackWindowModel keeps only the rows in view plus 3 of overscan
// (D27); the headers and the lanes are two Repeaters over it, scrolled by the
// one vertical offset. Lanes: one content item moved by the one horizontal
// offset (D28), each lane holding only the clips in the clip window. Zoom and
// pan state lives in TimelineViewState; TimelineGestureArea feeds it the wheel
// and pinch events and applies them once per frame (D29). The playhead is the
// only item bound to the clock (D30).
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: region
    required property TimelineModel timeline
    required property PlaybackClock clock

    readonly property alias viewState: view
    readonly property alias rows: rowModel
    readonly property alias gestures: clipGestures
    readonly property int headerWidth: Theme.trackHeaderWidth
    readonly property double lanesHeight: Math.max(0, height - Theme.toolbarHeight - Theme.rulerHeight - Theme.scrollbarHeight)

    objectName: "tracksRegion"
    color: Theme.backgroundDefault
    clip: true

    TimelineViewState {
        id: view
        objectName: "timelineViewState"
        contentEndMs: region.timeline.contentEndMs
        clipCount: region.timeline.clipCount
        viewportWidthPx: lanesArea.width
        viewportHeightPx: lanesArea.height
    }

    TrackWindowModel {
        id: rowModel
        objectName: "trackWindowModel"
        tracks: region.timeline.tracks
        viewState: view
    }

    // Clip moves, trims and the editing keys (M4). Zero-sized: it takes the
    // pointer only when a clip hands it a press.
    ClipGestureController {
        id: clipGestures
        objectName: "clipGestures"
        timeline: region.timeline
        viewState: view
        rows: rowModel
        clock: region.clock
        lanesViewport: lanesArea
    }

    // ── Toolbar (above the ruler) ──
    Rectangle {
        id: toolbar
        objectName: "timelineToolbar"
        width: parent.width
        height: Theme.toolbarHeight
        color: Theme.backgroundPaper
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: 1
            color: Theme.divider
        }
        // The edit toggles of the web toolbar: ripple (the gap-closing trims
        // and deletes) and the snap magnet.
        Row {
            x: Theme.spacingMd
            anchors.verticalCenter: parent.verticalCenter
            spacing: Theme.spacingXs
            ToolbarToggle {
                objectName: "rippleToggle"
                label: "Ripple"
                checked: clipGestures.rippleMode
                onToggled: clipGestures.rippleMode = !clipGestures.rippleMode
            }
            ToolbarToggle {
                objectName: "snapToggle"
                label: "Snap"
                checked: clipGestures.snapEnabled
                onToggled: clipGestures.snapEnabled = !clipGestures.snapEnabled
            }
        }
        TimelineZoomControls {
            anchors.right: parent.right
            anchors.rightMargin: Theme.spacingLg
            anchors.verticalCenter: parent.verticalCenter
            viewState: view
            clock: region.clock
        }
    }

    // ── Sub-header: TRACKS label + ruler ──
    Rectangle {
        id: tracksHeader
        objectName: "tracksSectionHeader"
        y: Theme.toolbarHeight
        width: region.headerWidth
        height: Theme.rulerHeight
        color: Theme.backgroundPaper
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: 1
            color: Theme.divider
        }
        Row {
            id: headerContent
            x: Theme.spacingLg
            height: parent.height - 1
            spacing: Theme.spacingSm
            Text {
                id: eyebrow
                anchors.verticalCenter: parent.verticalCenter
                text: "TRACKS"
                color: Theme.textSecondary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmaller
                font.letterSpacing: 0.06 * Theme.fontSizeSmaller
            }
        }
        // marginLeft: auto pushes the slider, the count and the add button right.
        Row {
            anchors.right: parent.right
            anchors.rightMargin: Theme.spacingLg
            height: parent.height - 1
            spacing: Theme.spacingSm
            TrackHeightSlider {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(0, Math.min(96, tracksHeader.width - eyebrow.width - 3 * Theme.spacingLg - countChip.width - addTrack.width - 3 * Theme.spacingSm))
                viewState: view
            }
            Rectangle {
                id: countChip
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(18, countText.implicitWidth + 2 * Theme.spacingSm)
                height: 16
                radius: Theme.radiusSm
                color: Theme.actionHover
                Text {
                    id: countText
                    anchors.centerIn: parent
                    text: rowModel.trackCount
                    color: Theme.textSecondary
                    font.family: Theme.monoFamily
                    font.pixelSize: Theme.fontSizeSmaller
                    font.weight: Font.DemiBold
                }
            }
            TrackIconButton {
                id: addTrack
                anchors.verticalCenter: parent.verticalCenter
                icon: Icons.add
            }
        }
    }

    TimeRuler {
        id: ruler
        x: region.headerWidth
        y: Theme.toolbarHeight
        width: region.width - region.headerWidth
        viewState: view
        fps: region.timeline.fps
        onSeekRequested: ms => region.clock.seek(ms)
    }

    // ── Track rows ──
    // Header column: clips vertically, scrolled with the lanes.
    Item {
        id: headerColumn
        objectName: "headerColumn"
        y: Theme.toolbarHeight + Theme.rulerHeight
        width: region.headerWidth
        height: region.lanesHeight
        clip: true

        Item {
            y: -view.scrollTopPx
            width: parent.width
            height: rowModel.contentHeight
            Repeater {
                model: rowModel
                delegate: TrackHeader {
                    required property double rowTop
                    y: rowTop
                    width: region.headerWidth - 1
                }
            }
        }
        // borderRight: 1px divider.
        Rectangle {
            anchors.right: parent.right
            width: 1
            height: parent.height
            color: Theme.divider
        }
    }

    // Lanes viewport.
    Item {
        id: lanesArea
        objectName: "lanesViewport"
        x: region.headerWidth
        y: Theme.toolbarHeight + Theme.rulerHeight
        width: region.width - region.headerWidth
        height: region.lanesHeight
        clip: true

        Item {
            id: lanesContent
            objectName: "lanesContent"
            x: -view.scrollLeftPx
            y: -view.scrollTopPx
            width: Math.max(view.totalWidthPx, lanesArea.width)
            height: rowModel.contentHeight
            Repeater {
                model: rowModel
                delegate: TrackLane {
                    required property double rowTop
                    y: rowTop
                    width: lanesContent.width
                    timeline: region.timeline
                    clock: region.clock
                    viewState: view
                    gestures: clipGestures
                }
            }
        }

        // SnapGuideOverlay: the candidate a moving edge locked onto.
        Rectangle {
            objectName: "snapGuide"
            visible: clipGestures.snapGuideMs >= 0
            x: clipGestures.snapGuideMs / view.msPerPx - view.scrollLeftPx
            width: 1
            height: parent.height
            color: Theme.warning
        }

        Text {
            objectName: "tracksEmptyHint"
            visible: region.timeline.clipCount === 0
            anchors.centerIn: parent
            width: parent.width - 2 * Theme.spacingXl
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            text: "Drag media here from the Library, or add a track to start."
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
        }
    }

    // ── Horizontal scrollbar ──
    TimelineScrollbar {
        y: region.height - height
        width: region.width
        leftInsetPx: region.headerWidth
        viewState: view
    }

    // Wheel and pinch over the ruler and the rows.
    TimelineGestureArea {
        id: gestures
        objectName: "timelineGestureArea"
        y: Theme.toolbarHeight
        width: region.width
        height: region.height - Theme.toolbarHeight
        viewState: view
        rulerTop: 0
        rowsTop: Theme.rulerHeight
        lanesLeft: region.headerWidth
    }

    // Playhead overlay: spans the ruler and the lanes, clipped to the lanes'
    // columns.
    Item {
        x: region.headerWidth
        y: Theme.toolbarHeight
        width: region.width - region.headerWidth
        height: Theme.rulerHeight + region.lanesHeight
        clip: true
        Playhead {
            height: parent.height
            clock: region.clock
            viewState: view
            fps: region.timeline.fps
            endMs: region.timeline.contentEndMs
            viewportWidthPx: parent.width
            grabTopPx: Theme.rulerHeight
        }
    }

    // Every editing and zoom key resolves through the web keymap.
    Keys.onPressed: event => {
        if (clipGestures.handleKey(event.key, event.text, event.modifiers, event.isAutoRepeat))
            event.accepted = true
    }
}

// Mirrors web/src/components/timeline/Tracks/TracksRegion.tsx:
//
//   toolbar                                   (36 px: ToolToggle, help, zoom)
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
    property string renamingTrackId: ""
    // Follow playhead (the toolbar's Follow toggle, on by default).
    property bool followPlayhead: true
    // The `?` key and the help button ask the editor for the shortcut sheet.
    signal shortcutsRequested()
    readonly property int headerWidth: Theme.trackHeaderWidth
    readonly property double lanesHeight: Math.max(0, height - Theme.toolbarHeight - Theme.rulerHeight - Theme.scrollbarHeight)

    objectName: "tracksRegion"
    color: Theme.backgroundDefault
    clip: true

    function focusTrackResize(id) {
        for (let i = 0; i < headerRepeater.count; ++i) {
            const header = headerRepeater.itemAt(i)
            if (header && header.trackId === id) { header.resizeHandle.forceActiveFocus() }
        }
    }

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
        // nextToolbarFit: the labelled row switches to icons once it overflows,
        // and back once the bar is as wide as the labelled row needed.
        property bool narrow: false
        property double neededWidth: 0
        readonly property double available: width - Theme.spacingMd - Theme.spacingLg
        readonly property double rowWidth: toolRow.width + toolbar.rightWidth + Theme.spacingXl
        readonly property double rightWidth: rightGroup.width
        function refit() {
            if (available <= 0) return
            if (!narrow) {
                if (rowWidth > available) { neededWidth = rowWidth; narrow = true }
            } else if (available >= neededWidth) {
                narrow = false
            }
        }
        onAvailableChanged: refit()
        onRowWidthChanged: refit()
        z: 5                                            // tooltips over the ruler
        ToolToggle {
            id: toolRow
            x: Theme.spacingMd
            anchors.verticalCenter: parent.verticalCenter
            gestures: clipGestures
            timeline: region.timeline
            viewState: view
            compact: toolbar.narrow
            followPlayhead: region.followPlayhead
            onFollowPlayheadChanged: region.followPlayhead = followPlayhead
        }
        Row {
            id: rightGroup
            anchors.right: parent.right
            anchors.rightMargin: Theme.spacingLg
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2
            ToolButton {
                objectName: "helpButton"
                anchors.verticalCenter: parent.verticalCenter
                label: "Keyboard shortcuts"
                iconOnly: true
                iconPath: Icons.helpOutline
                onClicked: region.shortcutsRequested()
            }
            TimelineZoomControls {
                anchors.verticalCenter: parent.verticalCenter
                compact: toolbar.narrow
                viewState: view
                clock: region.clock
            }
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
            Row {
                id: headerActions
                objectName: "trackHeaderActions"
                anchors.verticalCenter: parent.verticalCenter
                spacing: Theme.spacingSm
                Repeater {
                    model: TrackHeaderActions.items()
                    delegate: Loader {
                        required property var modelData
                        source: modelData.source
                    }
                }
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
                width: Math.max(0, Math.min(96, tracksHeader.width - headerContent.width - 3 * Theme.spacingLg - countChip.width - addTrack.width - 3 * Theme.spacingSm))
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
            AddTrackButton {
                id: addTrack
                anchors.verticalCenter: parent.verticalCenter
                timeline: region.timeline
            }
        }
    }

    TimeRuler {
        id: ruler
        x: region.headerWidth
        y: Theme.toolbarHeight
        width: region.width - region.headerWidth
        viewState: view
        gestures: clipGestures
        timeline: region.timeline
        fps: region.timeline.fps
        markers: region.timeline.markers
        onSeekRequested: ms => region.clock.seek(ms)
        onDeleteMarkerRequested: id => region.timeline.deleteMarker(id)
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
                id: headerRepeater
                model: rowModel
                delegate: TrackHeader {
                    id: header
                    required property double rowTop
                    timeline: region.timeline
                    gestures: clipGestures
                    viewState: view
                    onResizeStepRequested: heightPx => {
                        const id = header.trackId
                        Qt.callLater(region.focusTrackResize, id)
                        region.timeline.applyEdit("setTrackHeight", {trackId: id, heightPx: heightPx})
                    }
                    onDeleteRequested: {
                        headerMenu.trackId = header.trackId
                        headerMenu.trackName = header.name
                        headerMenu.trackType = header.trackType
                        for (let i = 0; i < headerMenu.count; ++i) {
                            const entry = headerMenu.itemAt(i)
                            if (entry && entry.objectName === "trackMenu-remove") { entry.triggered() }
                        }
                    }
                    y: rowTop
                    width: region.headerWidth - 1
                    MouseArea {
                        anchors.fill: parent
                        acceptedButtons: Qt.RightButton
                        enabled: region.renamingTrackId !== header.trackId
                        onClicked: mouse => {
                            const point = header.mapToItem(region, mouse.x, mouse.y)
                            headerMenu.openFor(header.trackId, header.name, header.trackType, point.x, point.y)
                        }
                    }
                    Loader {
                        active: region.renamingTrackId === header.trackId
                        x: Theme.spacingMd + Theme.iconSm + Theme.controlXs + Theme.spacingMd + Theme.spacingMicro
                        y: Theme.spacingXs
                        width: Math.min(151, header.width - x - Theme.controlXs - Theme.spacingMd)
                        height: Theme.controlXs + Theme.spacingMicro
                        sourceComponent: TextInput {
                            id: nameInput
                            objectName: "trackRename-" + header.trackId
                            text: header.name
                            color: Theme.textPrimary
                            font.family: Theme.sansFamily
                            font.pixelSize: Theme.fontSizeSmall
                            font.weight: Font.Medium
                            verticalAlignment: TextInput.AlignVCenter
                            selectByMouse: true
                            clip: true
                            Accessible.name: "Track name: " + header.name
                            property bool finished: false
                            function finish(cancel) {
                                if (finished) return
                                finished = true
                                const id = header.trackId
                                const original = header.name
                                const next = text.trim()
                                region.renamingTrackId = ""
                                if (!cancel && next !== "" && next !== original)
                                    region.timeline.applyEdit("setTrackName", { trackId: id, name: next })
                            }
                            Component.onCompleted: Qt.callLater(() => { forceActiveFocus(); selectAll() })
                            onAccepted: finish(false)
                            onActiveFocusChanged: if (!activeFocus) finish(false)
                            Keys.onEscapePressed: finish(true)
                            Rectangle { anchors.fill: parent; z: -1; color: Theme.backgroundDefault }
                        }
                    }
                }
            }
        }
        Rectangle {
            objectName: "trackDropLine"
            visible: clipGestures.trackDropY >= 0
            y: clipGestures.trackDropY - view.scrollTopPx
            width: parent.width
            height: 2
            color: Theme.primary
            z: 3
        }
        // borderRight: 1px divider.
        Rectangle {
            anchors.right: parent.right
            width: 1
            height: parent.height
            color: Theme.divider
        }
    }

    TrackHeaderMenu {
        id: headerMenu
        timeline: region.timeline
        onRenameRequested: id => region.renamingTrackId = id
        RegistryMenuItems {
            menu: headerMenu
            kind: "track"
            gestures: clipGestures
            context: ({ trackId: headerMenu.trackId, name: headerMenu.trackName,
                        type: headerMenu.trackType, editable: true })
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
            RubberBandOverlay {
                objectName: "rubberBand"
                bandRect: clipGestures.rubberBand.left !== undefined ? clipGestures.rubberBand : null
            }
        }

        // Hand and Zoom (TracksRegion.tsx): they take the press before any
        // lane or clip. Hand drags the lanes like a sheet; Zoom zooms in at
        // the click (x0.5) and out with Alt (x2).
        MouseArea {
            objectName: "handZoomArea"
            anchors.fill: parent
            z: 3
            enabled: clipGestures.activeTool === "hand" || clipGestures.activeTool === "zoom"
            acceptedButtons: Qt.LeftButton
            cursorShape: clipGestures.activeTool === "hand" ? (pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor)
                                                            : Qt.CrossCursor
            property double startX: 0
            property double startY: 0
            property double startLeft: 0
            property double startTop: 0
            onPressed: mouse => {
                if (clipGestures.activeTool === "zoom") {
                    view.zoomBy((mouse.modifiers & Qt.AltModifier) ? 2 : 0.5, view.timeAtViewportX(mouse.x))
                    return
                }
                startX = mouse.x
                startY = mouse.y
                startLeft = view.scrollLeftPx
                startTop = view.scrollTopPx
            }
            onPositionChanged: mouse => {
                if (clipGestures.activeTool !== "hand") return
                view.scrollLeftPx = startLeft - (mouse.x - startX)
                view.scrollTopPx = startTop - (mouse.y - startY)
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
            follow: region.followPlayhead
        }
    }

    // Every editing and zoom key resolves through the web keymap.
    Connections {
        target: clipGestures
        function onShortcutsToggled() { region.shortcutsRequested() }
        function onPasteAttributesRequested(source, targets) {
            attributes.source = source
            attributes.targets = targets
            attributes.open()
        }
    }
    PasteAttributesDialog {
        id: attributes
        parent: region
        onGroupsChosen: groups => clipGestures.pasteAttributes(attributes.source, attributes.targets.map(clip => clip.id), groups)
    }
    Keys.onPressed: event => {
        if (clipGestures.handleKey(event.key, event.text, event.modifiers, event.isAutoRepeat))
            event.accepted = true
    }
}

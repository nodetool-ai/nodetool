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
import NodeTool.UiPrimitives as Ui

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
    readonly property int headerWidth: TimelineMetrics.trackHeaderWidth
    readonly property double lanesHeight: Math.max(0, height - TimelineMetrics.toolbarHeight - TimelineMetrics.rulerHeight - TimelineMetrics.scrollbarHeight)

    objectName: "tracksRegion"
    color: Ui.Theme.surfaceCanvas
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
        height: TimelineMetrics.toolbarHeight
        color: Ui.Theme.surfacePanel
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: Ui.Metrics.border
            color: Ui.Theme.borderSubtle
        }
        // nextToolbarFit: the labelled row switches to icons once it overflows,
        // and back once the bar is as wide as the labelled row needed.
        property bool narrow: false
        property double neededWidth: 0
        readonly property double available: width - Ui.Metrics.md - Ui.Metrics.lg
        readonly property double rowWidth: toolRow.width + toolbar.rightWidth + Ui.Metrics.xl
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
        z: TimelineMetrics.toolbarLayer                 // tooltips over the ruler
        Flickable {
            id: toolViewport
            objectName: "timelineToolViewport"
            x: Ui.Metrics.md
            width: Math.max(0, rightGroup.x - x - Ui.Metrics.xs)
            height: parent.height
            contentWidth: toolRow.width
            contentHeight: height
            flickableDirection: Flickable.HorizontalFlick
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentWidth > width
            clip: true
            ToolToggle {
                id: toolRow
                anchors.verticalCenter: parent.verticalCenter
                gestures: clipGestures
                timeline: region.timeline
                viewState: view
                compact: toolbar.narrow
                followPlayhead: region.followPlayhead
                onFollowPlayheadChanged: region.followPlayhead = followPlayhead
            }
        }
        Row {
            id: rightGroup
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.lg
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.micro
            ToolButton {
                objectName: "helpButton"
                anchors.verticalCenter: parent.verticalCenter
                label: "Keyboard shortcuts"
                iconOnly: true
                iconName: "helpOutline"
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
        y: TimelineMetrics.toolbarHeight
        width: region.headerWidth
        height: TimelineMetrics.rulerHeight
        color: Ui.Theme.surfacePanel
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: Ui.Metrics.border
            color: Ui.Theme.borderSubtle
        }
        Row {
            id: headerContent
            x: Ui.Metrics.lg
            height: parent.height - 1
            spacing: Ui.Metrics.sm
            Ui.Text {
                id: eyebrow
                anchors.verticalCenter: parent.verticalCenter
                text: "TRACKS"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Row {
                id: headerActions
                objectName: "trackHeaderActions"
                anchors.verticalCenter: parent.verticalCenter
                spacing: Ui.Metrics.sm
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
            anchors.rightMargin: Ui.Metrics.lg
            height: parent.height - 1
            spacing: Ui.Metrics.sm
            TrackHeightSlider {
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(0, Math.min(Ui.Metrics.standard * 3, tracksHeader.width - headerContent.width - 3 * Ui.Metrics.lg - countChip.width - addTrack.width - 3 * Ui.Metrics.sm))
                viewState: view
            }
            Rectangle {
                id: countChip
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(Ui.Metrics.iconMd, countText.implicitWidth + 2 * Ui.Metrics.sm)
                height: Ui.Metrics.iconSm
                radius: Ui.Metrics.xs
                color: Ui.Theme.actionHover
                Ui.Text {
                    id: countText
                    anchors.centerIn: parent
                    text: rowModel.trackCount
                    role: Ui.Typography.MonoCaption
                    tone: Ui.Text.Secondary
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
        y: TimelineMetrics.toolbarHeight
        width: region.width - region.headerWidth
        viewState: view
        gestures: clipGestures
        timeline: region.timeline
        fps: region.timeline.fps
        markers: region.timeline.markers
        onSeekRequested: ms => region.clock.seek(ms)
        onScrubRequested: ms => region.clock.scrub(ms)
        onDeleteMarkerRequested: id => region.timeline.deleteMarker(id)
    }

    // ── Track rows ──
    // Header column: clips vertically, scrolled with the lanes.
    Item {
        id: headerColumn
        objectName: "headerColumn"
        y: TimelineMetrics.toolbarHeight + TimelineMetrics.rulerHeight
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
                    required property double baseRowHeight
                    required property var track
                    rowHeight: baseRowHeight
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
                    function openKeyboardMenu() {
                        if (region.renamingTrackId === header.trackId) return
                        headerMenu.trackId = header.trackId
                        headerMenu.trackName = header.name
                        headerMenu.trackType = header.trackType
                        headerMenu.openAt(header)
                    }
                    activeFocusOnTab: true
                    Accessible.role: Accessible.Grouping
                    Accessible.name: "Track " + header.name + " actions"
                    Accessible.expandable: true
                    Accessible.expanded: headerMenu.visible && headerMenu.trackId === header.trackId
                    Keys.onMenuPressed: event => { header.openKeyboardMenu(); event.accepted = true }
                    Keys.onPressed: event => {
                        if (event.key === Qt.Key_F10 && (event.modifiers & Qt.ShiftModifier)) {
                            header.openKeyboardMenu()
                            event.accepted = true
                        }
                    }
                    y: rowTop
                    width: region.headerWidth - 1
                    SlotItems {
                        // Keep the rows outside the base header's clipping rectangle.
                        parent: header.parent
                        y: header.rowTop + header.baseRowHeight
                        width: header.width
                        height: rowModel.extraRowHeights[header.trackId] || 0
                        slot: "trackHeaderLane"
                        vertical: true
                        slotProperties: ({ track: header.track, timeline: region.timeline })
                    }
                    MouseArea {
                        anchors.fill: parent
                        acceptedButtons: Qt.RightButton
                        enabled: region.renamingTrackId !== header.trackId
                        onClicked: mouse => {
                            header.forceActiveFocus(Qt.MouseFocusReason)
                            headerMenu.returnFocusTo = header
                            const point = header.mapToItem(region, mouse.x, mouse.y)
                            headerMenu.openFor(header.trackId, header.name, header.trackType, point.x, point.y)
                        }
                    }
                    Loader {
                        active: region.renamingTrackId === header.trackId
                        x: Ui.Metrics.md + Ui.Metrics.iconSm + Ui.Metrics.small + Ui.Metrics.md + Ui.Metrics.micro
                        y: Ui.Metrics.xs
                        width: Math.min(Ui.Metrics.small * 6 + Ui.Metrics.sm, header.width - x - Ui.Metrics.small - Ui.Metrics.md)
                        height: Ui.Metrics.compact
                        sourceComponent: Ui.TextField {
                            id: nameInput
                            objectName: "trackRename-" + header.trackId
                            value: header.name
                            density: Ui.EditorButton.Compact
                            selectByMouse: true
                            clip: true
                            accessibleName: "Track name: " + header.name
                            property bool finished: false
                            function finish(cancel, proposed) {
                                if (finished) return
                                finished = true
                                const id = header.trackId
                                const original = header.name
                                const next = (proposed === undefined ? text : proposed).trim()
                                region.renamingTrackId = ""
                                if (!cancel && next !== "" && next !== original)
                                    region.timeline.applyEdit("setTrackName", { trackId: id, name: next })
                            }
                            Component.onCompleted: Qt.callLater(() => { forceActiveFocus(); selectAll() })
                            onValueCommitted: value => finish(false, value)
                            onAccepted: finish(false)
                            onActiveFocusChanged: if (!activeFocus) finish(false)
                            onEditCanceled: finish(true)
                            Keys.onEscapePressed: finish(true)
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
            height: Ui.Metrics.focus
            color: Ui.Theme.accentPrimary
            z: TimelineMetrics.clipOverlayLayer
        }
        // borderRight: 1px divider.
        Rectangle {
            anchors.right: parent.right
            width: Ui.Metrics.border
            height: parent.height
            color: Ui.Theme.borderSubtle
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
        y: TimelineMetrics.toolbarHeight + TimelineMetrics.rulerHeight
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
                delegate: Item {
                    id: trackRow
                    required property double rowTop
                    required property double rowHeight
                    required property double baseRowHeight
                    required property string trackId
                    required property string trackType
                    required property bool trackVisible
                    required property bool locked
                    required property bool muted
                    required property var track
                    y: rowTop
                    width: lanesContent.width
                    height: rowHeight
                    TrackLane {
                        width: parent.width
                        rowHeight: trackRow.baseRowHeight
                        trackId: trackRow.trackId
                        trackType: trackRow.trackType
                        trackVisible: trackRow.trackVisible
                        locked: trackRow.locked
                        muted: trackRow.muted
                        timeline: region.timeline
                        clock: region.clock
                        viewState: view
                        gestures: clipGestures
                    }
                    SlotItems {
                        id: laneRows
                        y: trackRow.baseRowHeight
                        width: parent.width
                        slot: "trackLane"
                        vertical: true
                        slotProperties: ({ track: trackRow.track, timeline: region.timeline })
                        function reportHeight() {
                            if ((rowModel.extraRowHeights[trackRow.trackId] || 0) === implicitHeight) return
                            const heights = Object.assign({}, rowModel.extraRowHeights)
                            heights[trackRow.trackId] = implicitHeight
                            rowModel.extraRowHeights = heights
                        }
                        onImplicitHeightChanged: Qt.callLater(reportHeight)
                        Component.onCompleted: Qt.callLater(reportHeight)
                    }
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
            z: TimelineMetrics.clipOverlayLayer
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
            width: Ui.Metrics.border
            height: parent.height
            color: Ui.Theme.statusWarning
        }

        Ui.Text {
            objectName: "tracksEmptyHint"
            visible: region.timeline.clipCount === 0
            anchors.centerIn: parent
            width: parent.width - 2 * Ui.Metrics.xl
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
            text: "Drag media here from the Library, or add a track to start."
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
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
        y: TimelineMetrics.toolbarHeight
        width: region.width
        height: region.height - TimelineMetrics.toolbarHeight
        viewState: view
        rulerTop: 0
        rowsTop: TimelineMetrics.rulerHeight
        lanesLeft: region.headerWidth
    }

    // Playhead overlay: spans the ruler and the lanes, clipped to the lanes'
    // columns.
    Item {
        x: region.headerWidth
        y: TimelineMetrics.toolbarHeight
        width: region.width - region.headerWidth
        height: TimelineMetrics.rulerHeight + region.lanesHeight
        clip: true
        Playhead {
            height: parent.height
            clock: region.clock
            viewState: view
            fps: region.timeline.fps
            endMs: region.timeline.contentEndMs
            viewportWidthPx: parent.width
            grabTopPx: TimelineMetrics.rulerHeight
            passthroughRoot: lanesArea
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

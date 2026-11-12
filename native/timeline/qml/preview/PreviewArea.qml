// The Program monitor: the compositor, letterboxed to the canvas aspect ratio,
// over Premiere-style controls taken from filmcraft's monitor.rs. From the top:
// the controls row (the editable playhead timecode, the zoom and playback
// resolution menus, scrub audio, the wrench menu and the duration), the mini
// timeline (ticks, markers, the in/out range and the playhead; press seeks,
// drag scrubs), its zoom scroll bar, and the transport row (Add Marker, Mark In
// and Out, Go to In, previous edit, frame steps, Play, next edit, Go to Out,
// Lift, Extract, Export Frame and Loop). Buttons that do not fit go to an
// overflow menu, and the Button Editor hides buttons per user. Below the compact
// width the view settings take a second row. The monitor also has zoom and pan,
// overlays, guides and registered monitor views.
//
// `previewFrame` is the whole picture at its zoomed size and can be far larger
// than the screen. Only what is on screen is rendered: the compositor covers
// the visible part. Painted overlays size themselves to `monitor.visibleItemRect`.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: area
    required property TimelineModel timeline
    required property PlaybackClock clock
    property var gestures: null
    readonly property MonitorViewState monitor: viewState

    color: Ui.Theme.surfaceCanvas
    clip: true

    readonly property real canvasAspect: timeline.canvasWidth / timeline.canvasHeight
    readonly property double frameMs: 1000 / Math.max(1, timeline.fps)
    readonly property bool handTool: gestures !== null && gestures.activeTool === "hand"

    // The registered view that is showing, or null for the compositor's own modes.
    readonly property var monitorViews: PanelRegistry.forSlot("monitorView")
    readonly property var activeView: {
        for (const view of monitorViews) {
            if (view.id === viewState.displayMode) return view
        }
        return null
    }
    // A view keeps the live picture by setting `keepsPicture: true`, and can set
    // `pictureArea`, a rect in the view's coordinates that the picture fits into.
    readonly property bool pictureShown: activeView === null || (viewLoader.item !== null && viewLoader.item.keepsPicture === true)
    readonly property rect pictureBounds: {
        const item = activeView !== null ? viewLoader.item : null
        if (item && item.keepsPicture === true && item.pictureArea !== undefined) return item.pictureArea
        return Qt.rect(0, 0, pictureHost.width, pictureHost.height)
    }

    MonitorViewState {
        id: viewState
        objectName: "monitorViewState"
        owner: area.gestures
        viewportSize: Qt.size(area.pictureBounds.width, area.pictureBounds.height)
        canvasSize: Qt.size(area.timeline.canvasWidth, area.timeline.canvasHeight)
        devicePixelRatio: Screen.devicePixelRatio
    }

    Item {
        id: viewport
        width: parent.width
        height: parent.height - controlBar.height

        Item {
            id: pictureHost
            readonly property real inset: viewState.rulers ? TimelineMetrics.monitorRulerThickness : 0
            x: inset
            y: inset
            width: viewport.width - inset
            height: viewport.height - inset
            clip: true

            Item {
                id: box
                objectName: "monitorPictureBox"
                x: area.pictureBounds.x
                y: area.pictureBounds.y
                width: area.pictureBounds.width
                height: area.pictureBounds.height
                clip: true

                WheelHandler {
                    objectName: "monitorWheel"
                    target: null
                    acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
                    enabled: area.pictureShown
                    onWheel: event => {
                        const notches = event.angleDelta.y !== 0 ? event.angleDelta.y / 120 : event.pixelDelta.y / 40
                        viewState.zoomByWheelNotches(Qt.point(event.x, event.y), notches)
                    }
                }
                PinchHandler {
                    objectName: "monitorPinch"
                    target: null
                    enabled: area.pictureShown
                    onScaleChanged: delta => viewState.zoomAt(centroid.position, delta)
                }
                DragHandler {
                    objectName: "monitorMiddlePan"
                    target: null
                    acceptedButtons: Qt.MiddleButton
                    dragThreshold: 0
                    enabled: area.pictureShown
                    cursorShape: Qt.ClosedHandCursor
                    onTranslationChanged: delta => viewState.panBy(Qt.point(delta.x, delta.y))
                }
                DragHandler {
                    objectName: "monitorHandPan"
                    target: null
                    acceptedButtons: Qt.LeftButton
                    dragThreshold: 0
                    enabled: area.pictureShown && area.handTool
                    cursorShape: Qt.ClosedHandCursor
                    onTranslationChanged: delta => viewState.panBy(Qt.point(delta.x, delta.y))
                }
                HoverHandler {
                    enabled: area.handTool
                    cursorShape: Qt.OpenHandCursor
                }

                Item {
                    id: frame
                    objectName: "previewFrame"
                    clip: true
                    visible: area.pictureShown
                    x: viewState.pictureRect.x
                    y: viewState.pictureRect.y
                    width: viewState.pictureRect.width
                    height: viewState.pictureRect.height
                    PreviewCompositor {
                        objectName: "previewCompositor"
                        x: viewState.visibleItemRect.x
                        y: viewState.visibleItemRect.y
                        width: viewState.visibleItemRect.width
                        height: viewState.visibleItemRect.height
                        timeline: area.timeline
                        clock: area.clock
                        canvasRegion: viewState.visibleCanvasRect
                        playbackResolution: viewState.playbackResolution
                        pausedResolution: viewState.pausedResolution
                        alphaDisplay: viewState.displayMode === "alpha"
                        transparencyGrid: viewState.transparencyGrid
                    }
                    Loader {
                        anchors.fill: parent
                        active: viewState.safeMargins
                        sourceComponent: Component { MonitorSafeMargins {} }
                    }
                    SlotItems {
                        objectName: "previewSlotItems"
                        anchors.fill: parent
                        slot: "preview"
                        overlay: true
                        visible: viewState.showControls
                        enabled: !area.handTool
                        slotProperties: ({ timeline: area.timeline, clock: area.clock })
                    }
                }
                MonitorGuides {
                    anchors.fill: parent
                    visible: area.pictureShown && viewState.guidesVisible
                    enabled: !area.handTool
                    monitor: viewState
                }
            }
            Loader {
                id: viewLoader
                objectName: "monitorViewLoader"
                anchors.fill: parent
                function reload() {
                    const view = area.activeView
                    if (view === null) source = ""
                    else setSource(view.source, { timeline: area.timeline, clock: area.clock, gestures: area.gestures, monitor: viewState })
                }
                Connections {
                    target: area
                    function onActiveViewChanged() { viewLoader.reload() }
                }
                Component.onCompleted: reload()
                onStatusChanged: {
                    if (status !== Loader.Error) return
                    console.warn("Monitor view failed to load:", viewState.displayMode)
                    // Not while the loader is still handling the bad source.
                    Qt.callLater(() => { viewState.displayMode = "composite" })
                }
            }
        }
        Loader {
            active: viewState.rulers
            anchors.fill: parent
            sourceComponent: Component {
                MonitorRulers {
                    monitor: viewState
                    pictureBox: box
                }
            }
        }
    }

    // The controls under the picture, as in Premiere and filmcraft's monitor.rs.
    readonly property bool stackedControls: width < TimelineMetrics.monitorCompactWidth
    // The part of the sequence the mini timeline shows, as fractions. 0..1 shows all of it.
    property real timeZoomStart: 0
    property real timeZoomEnd: 1
    // The transport, in Premiere's order. `id` is the key action, except for the clock steps.
    readonly property var transportButtons: [
        {id: "addMarker", icon: "addMarker", label: "Add Marker"},
        {id: "markIn", icon: "markIn", label: "Mark In"},
        {id: "markOut", icon: "markOut", label: "Mark Out"},
        {id: "goToIn", icon: "goToIn", label: "Go to In"},
        {id: "prevCut", icon: "previousEdit", label: "Go to Previous Edit Point"},
        {id: "stepFrameBack", icon: "stepBackFrame", label: "Step Back 1 Frame"},
        {id: "playPause", icon: "playArrow", label: "Play-Stop Toggle"},
        {id: "stepFrameForward", icon: "stepForwardFrame", label: "Step Forward 1 Frame"},
        {id: "nextCut", icon: "nextEdit", label: "Go to Next Edit Point"},
        {id: "goToOut", icon: "goToOut", label: "Go to Out"},
        {id: "liftRange", icon: "liftRange", label: "Lift"},
        {id: "extractRange", icon: "extractRange", label: "Extract"},
        {id: "exportFrame", icon: "photoCamera", label: "Export Frame"},
        {id: "toggleLoop", icon: "repeat", label: "Loop"}
    ]
    // The Button Editor hides buttons; their shortcuts and menu items still work.
    readonly property var hiddenTransport: transportPreferences.hiddenTransportButtons
    readonly property var visibleTransport: transportButtons.filter(b => hiddenTransport.indexOf(b.id) < 0)
    readonly property real transportAvailable: Math.max(0, width - TimelineMetrics.monitorTransportReserve)
    readonly property real transportGap: {
        const count = visibleTransport.length
        return count * TimelineMetrics.monitorTransportButton + Math.max(0, count - 1) * Ui.Metrics.sm <= transportAvailable
            ? Ui.Metrics.sm : Ui.Metrics.micro
    }
    // Buttons that do not fit go to the overflow menu, which takes one place.
    readonly property int transportShownCount: {
        const count = visibleTransport.length
        const pitch = TimelineMetrics.monitorTransportButton + transportGap
        if (count * pitch - transportGap <= transportAvailable) return count
        return Math.max(0, Math.floor((transportAvailable + transportGap) / pitch) - 1)
    }
    // Any preference write re-reads the hidden list. The lists change only when their buttons do,
    // so a write never rebuilds the buttons under the pointer.
    property var shownTransport: []
    property var overflowTransport: []
    function refreshTransport() {
        const shown = visibleTransport.slice(0, transportShownCount)
        const overflow = visibleTransport.slice(transportShownCount)
        const ids = list => list.map(b => b.id).join(",")
        if (ids(shown) !== ids(shownTransport)) shownTransport = shown
        if (ids(overflow) !== ids(overflowTransport)) overflowTransport = overflow
    }
    onVisibleTransportChanged: refreshTransport()
    onTransportShownCountChanged: refreshTransport()
    Component.onCompleted: refreshTransport()

    Preferences { id: transportPreferences }

    function transportShortcut(id) {
        return gestures !== null && gestures.keyboardPreset !== "" ? gestures.shortcutFor(id) : ""
    }
    function transportLabel(button) {
        return button.id === "playPause" ? (clock.playing ? "Pause" : "Play") : button.label
    }
    function transportEnabled(id) {
        if (id === "stepFrameBack" || id === "stepFrameForward") return !clock.playing
        if (id === "playPause" || id === "toggleLoop") return true
        return gestures !== null
    }
    function runTransport(id) {
        if (id === "playPause") clock.toggle()
        else if (id === "stepFrameBack") clock.seek(Math.max(0, clock.time - frameMs))
        else if (id === "stepFrameForward") clock.seek(Math.min(timeline.contentEndMs, clock.time + frameMs))
        else if (id === "toggleLoop") clock.loop = !clock.loop
        else if (id === "exportFrame") gestures.runAction("exportFrame", {monitor: "program"})
        else gestures.runAction(id)
    }
    function setTransportShown(id, shown) {
        const hidden = hiddenTransport.filter(other => other !== id)
        if (!shown) hidden.push(id)
        transportPreferences.hiddenTransportButtons = hidden
    }
    function resetTransport() { transportPreferences.hiddenTransportButtons = [] }
    function setTimeZoom(start, end) {
        timeZoomStart = start
        timeZoomEnd = end
    }

    component TransportButton: Ui.ToolbarIconButton {
        id: transportButton
        required property var modelData
        readonly property string actionId: modelData.id
        objectName: actionId === "playPause" ? "transportPlay" : actionId === "exportFrame" ? "exportFrameButton" : "transport_" + actionId
        width: TimelineMetrics.monitorTransportButton
        height: TimelineMetrics.monitorTransportButton
        iconName: actionId === "playPause" && area.clock.playing ? "pause" : modelData.icon
        iconSize: actionId === "playPause" ? Ui.Metrics.iconLg : Ui.Metrics.iconMd
        accessibleName: area.transportLabel(modelData)
        shortcutText: area.transportShortcut(actionId)
        active: actionId === "toggleLoop" && area.clock.loop
        Accessible.checkable: actionId === "toggleLoop"
        Accessible.checked: active
        enabled: area.transportEnabled(actionId)
        disabledReason: actionId === "stepFrameBack" || actionId === "stepFrameForward" ? "Pause playback to step one frame" : "Open a sequence first"
        onClicked: area.runTransport(actionId)
    }

    Rectangle {
        id: controlBar
        objectName: "transportBar"
        y: parent.height - height
        width: parent.width
        height: TimelineMetrics.monitorControlsRowHeight + (area.stackedControls ? TimelineMetrics.monitorStackedRowHeight : 0)
                + TimelineMetrics.monitorScrubHeight + TimelineMetrics.monitorZoomBarHeight + TimelineMetrics.monitorTransportRowHeight
        color: Ui.Theme.surfacePanel
        Rectangle {
            width: parent.width
            height: Ui.Metrics.border
            color: Ui.Theme.borderSubtle
        }

        // Controls row: timecode, zoom, resolution, scrub audio, wrench and duration.
        Item {
            id: controlsRow
            x: TimelineMetrics.monitorControlsInset
            y: Ui.Metrics.micro
            width: parent.width - TimelineMetrics.monitorControlsInset * 2
            height: TimelineMetrics.monitorStackedRowHeight
            TimecodeField {
                objectName: "transportTimecode"
                width: Math.max(implicitWidth, TimelineMetrics.monitorTimecodeWidth)
                height: parent.height
                timeMs: area.clock.time
                fps: area.timeline.fps
                dropFrame: area.timeline.dropFrame
                maxMs: area.timeline.contentEndMs
                textRole: Ui.Typography.MonoStrong
                domainColor: TimelineVisuals.editBlue
                accessibleName: "Playhead timecode"
                onSeekRequested: ms => area.clock.seek(ms)
            }
            Ui.Text {
                objectName: "transportDuration"
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: TimelineFormat.timecode(area.timeline.contentEndMs, area.timeline.fps, area.timeline.dropFrame)
                role: Ui.Typography.MonoLabel
                tone: Ui.Text.Secondary
                Accessible.name: "Sequence duration " + text
            }
        }
        Item {
            id: settingsRow
            x: controlsRow.x
            y: controlsRow.y + (area.stackedControls ? TimelineMetrics.monitorStackedRowHeight : 0)
            width: controlsRow.width
            height: controlsRow.height
            MonitorZoomMenu {
                id: zoomMenu
                anchors.verticalCenter: parent.verticalCenter
                x: area.stackedControls ? Math.max(0, settingsRow.width / 2 - TimelineMetrics.monitorStackedZoomOffset) : TimelineMetrics.monitorZoomOffset
                monitor: viewState
            }
            Row {
                id: viewSettings
                anchors.verticalCenter: parent.verticalCenter
                x: area.stackedControls ? zoomMenu.x + zoomMenu.width + Ui.Metrics.sm
                                        : settingsRow.width - width - durationGap.width
                spacing: Ui.Metrics.sm
                Ui.MenuButton {
                    id: resolutionButton
                    objectName: "monitorResolutionButton"
                    anchors.verticalCenter: parent.verticalCenter
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    text: viewState.playbackResolution === 1 ? "Full" : "1/" + viewState.playbackResolution
                    accessibleName: "Playback resolution " + text
                    menu: Ui.ContextMenu {
                        id: resolutionMenu
                        objectName: "monitorResolutionMenu"
                        popupType: Controls.Popup.Item
                        Instantiator {
                            model: [{label: "Full", denominator: 1}, {label: "1/2", denominator: 2},
                                    {label: "1/4", denominator: 4}, {label: "1/8", denominator: 8}]
                            onObjectAdded: (index, object) => resolutionMenu.addItem(object)
                            onObjectRemoved: (index, object) => resolutionMenu.removeItem(object)
                            delegate: Ui.MenuItem {
                                required property var modelData
                                objectName: "monitorResolution_" + modelData.denominator
                                text: modelData.label
                                checkable: true
                                checked: viewState.playbackResolution === modelData.denominator
                                onTriggered: viewState.playbackResolution = modelData.denominator
                            }
                        }
                    }
                }
                Ui.ToolbarIconButton {
                    objectName: "transportScrubAudio"
                    anchors.verticalCenter: parent.verticalCenter
                    iconName: area.clock.scrubAudio ? "volumeUp" : "volumeOffOutlined"
                    active: area.clock.scrubAudio
                    Accessible.checkable: true
                    Accessible.checked: area.clock.scrubAudio
                    accessibleName: "Play audio while scrubbing"
                    shortcutText: "Shift+S"
                    onClicked: area.clock.scrubAudio = !area.clock.scrubAudio
                }
                Ui.ToolbarIconButton {
                    id: settingsButton
                    objectName: "monitorSettingsButton"
                    anchors.verticalCenter: parent.verticalCenter
                    iconName: "wrench"
                    accessibleName: "Monitor settings"
                    menuButton: true
                    menuExpanded: settingsMenu.visible
                    onClicked: settingsMenu.visible ? settingsMenu.close() : settingsMenu.openAt(settingsButton)
                }
            }
            // The duration's place at the right of the first row.
            Item {
                id: durationGap
                width: area.stackedControls ? 0 : TimelineMetrics.monitorTimecodeWidth
                height: 1
            }
        }

        // Mini timeline: ticks, markers, in/out and the playhead. Press seeks, drag scrubs.
        MonitorMiniTimeline {
            id: scrubber
            objectName: "transportScrubber"
            x: controlsRow.x
            y: controlsRow.y + TimelineMetrics.monitorStackedRowHeight + (area.stackedControls ? TimelineMetrics.monitorStackedRowHeight : 0)
            width: controlsRow.width
            height: TimelineMetrics.monitorScrubHeight
            durationMs: area.timeline.contentEndMs
            fps: area.timeline.fps
            timeMs: area.clock.time
            zoomStart: area.timeZoomStart
            zoomEnd: area.timeZoomEnd
            rangeInMs: area.clock.rangeInMs
            rangeOutMs: area.clock.rangeOutMs
            markers: area.timeline.markers
            uiScale: Ui.Theme.uiScale
            tickColor: Ui.Theme.textDisabled
            rangeColor: Ui.Theme.borderControl
            playheadColor: TimelineVisuals.editBlue
            markerColor: Ui.Theme.accentPrimary
            Accessible.role: Accessible.Slider
            Accessible.name: "Playhead position"
            onSeekRequested: ms => area.clock.seek(ms)
            onScrubRequested: ms => area.clock.scrub(ms)
            onMarkerClicked: (index, modifiers) => {
                const marker = markers[index]
                const additive = (modifiers & (Qt.ControlModifier | Qt.MetaModifier)) !== 0
                MarkerSession.select(marker.id, additive)
                if (!additive) area.clock.seek(marker.timeMs)
            }
            onMarkerDoubleClicked: index => MarkerSession.requestEdit(markers[index].id)
            onMarkerMenuRequested: (index, menuX, menuY) => {
                const marker = markers[index]
                if (!MarkerSession.isSelected(marker.id)) MarkerSession.select(marker.id)
                markerMenu.context = { markerId: marker.id, timeMs: marker.timeMs, color: marker.color ?? "", editable: true }
                markerMenu.popupAt(scrubber, menuX, menuY)
            }
        }
        // Zoom scroll bar: drag a handle to zoom the mini timeline, the middle to scroll.
        MonitorZoomBar {
            id: zoomBar
            objectName: "monitorTimeZoomBar"
            x: scrubber.x
            y: scrubber.y + scrubber.height
            width: scrubber.width
            height: TimelineMetrics.monitorZoomBarHeight
            start: area.timeZoomStart
            end: area.timeZoomEnd
            // Five frames at the most zoom, as in filmcraft.
            minSpan: Math.min(1, 5 * area.frameMs / Math.max(1, area.timeline.contentEndMs))
            uiScale: Ui.Theme.uiScale
            trackColor: Ui.Theme.borderSubtle
            thumbColor: Ui.Theme.borderControl
            thumbHoverColor: Ui.Theme.borderStrong
            handleFill: Ui.Theme.surfacePanel
            handleStroke: Ui.Theme.textPrimary
            Accessible.role: Accessible.ScrollBar
            Accessible.name: "Mini timeline zoom"
            onRangeEdited: (start, end) => area.setTimeZoom(start, end)
        }

        // Transport row: centred buttons, an overflow menu and the Button Editor.
        Row {
            id: transportRow
            objectName: "transportButtons"
            y: zoomBar.y + zoomBar.height + Ui.Metrics.xs + Ui.Metrics.micro
            x: Math.max(0, parent.width / 2 - TimelineMetrics.monitorButtonEditorWidth / 2 - width / 2)
            spacing: area.transportGap
            Repeater {
                model: area.shownTransport
                delegate: TransportButton {}
            }
            Ui.ToolbarIconButton {
                id: overflowButton
                objectName: "transportOverflow"
                visible: area.overflowTransport.length > 0
                width: TimelineMetrics.monitorTransportButton
                height: TimelineMetrics.monitorTransportButton
                iconName: "moreHoriz"
                accessibleName: "More transport controls"
                menuButton: true
                menuExpanded: overflowMenu.visible
                onClicked: overflowMenu.visible ? overflowMenu.close() : overflowMenu.openAt(overflowButton)
            }
        }
        Ui.ToolbarIconButton {
            id: editorButton
            objectName: "transportButtonEditor"
            x: parent.width - TimelineMetrics.monitorButtonEditorWidth
            anchors.verticalCenter: transportRow.verticalCenter
            iconName: "add"
            accessibleName: "Button Editor"
            menuButton: true
            menuExpanded: editorMenu.visible
            onClicked: editorMenu.visible ? editorMenu.close() : editorMenu.openAt(editorButton)
        }
    }
    Ui.ContextMenu {
        id: overflowMenu
        objectName: "transportOverflowMenu"
        popupType: Controls.Popup.Item
        Instantiator {
            model: area.overflowTransport
            onObjectAdded: (index, object) => overflowMenu.insertItem(index, object)
            onObjectRemoved: (index, object) => overflowMenu.removeItem(object)
            delegate: Ui.MenuItem {
                required property var modelData
                objectName: "transportOverflow_" + modelData.id
                text: area.transportLabel(modelData)
                shortcutText: area.transportShortcut(modelData.id)
                checkable: modelData.id === "toggleLoop"
                checked: modelData.id === "toggleLoop" && area.clock.loop
                enabled: area.transportEnabled(modelData.id)
                onTriggered: area.runTransport(modelData.id)
            }
        }
    }
    Ui.ContextMenu {
        id: editorMenu
        objectName: "transportButtonEditorMenu"
        popupType: Controls.Popup.Item
        Instantiator {
            model: area.transportButtons
            onObjectAdded: (index, object) => editorMenu.insertItem(index, object)
            onObjectRemoved: (index, object) => editorMenu.removeItem(object)
            delegate: Ui.MenuItem {
                required property var modelData
                objectName: "transportEditor_" + modelData.id
                text: modelData.label
                checkable: true
                checked: area.hiddenTransport.indexOf(modelData.id) < 0
                onTriggered: area.setTransportShown(modelData.id, checked)
            }
        }
        Controls.MenuSeparator { contentItem: Ui.Separator {} }
        Ui.MenuItem {
            objectName: "transportEditorReset"
            text: "Reset"
            onTriggered: area.resetTransport()
        }
    }
    RegistryContextMenu {
        id: markerMenu
        kind: "marker"
        gestures: area.gestures
    }
    MonitorSettingsMenu {
        id: settingsMenu
        monitor: viewState
        views: area.monitorViews
    }
}

// Mirrors web/src/components/timeline/preview/PreviewArea.tsx: the
// compositor, letterboxed to the canvas aspect ratio, over the transport bar
// (start, frame back, play, stop, loop, frame forward, end, the timecode, the
// scrubber, the duration and the fps). The native monitor adds view controls
// the web has no equivalent for: zoom and pan, resolution, overlays, guides and
// registered monitor views. The quality select, volume, matte and fullscreen
// controls are not part of the prototype.
//
// `previewFrame` is the whole picture at its zoomed size and can be far larger
// than the screen. Only what is on screen is rendered: the compositor covers
// the visible part. Painted overlays size themselves to `monitor.visibleItemRect`.
pragma ComponentBehavior: Bound
import QtQuick
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
                disabledReason: "Pause playback to step one frame"
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
                disabledReason: "Pause playback to step one frame"
                onClicked: area.clock.seek(Math.min(area.timeline.contentEndMs, area.clock.time + area.frameMs))
            }
            Ui.ToolbarIconButton {
                iconName: "skipNext"
                accessibleName: "Go to end"
                onClicked: area.clock.seek(area.timeline.contentEndMs)
            }
            TimecodeField {
                objectName: "transportTimecode"
                anchors.verticalCenter: parent.verticalCenter
                timeMs: area.clock.time
                fps: area.timeline.fps
                dropFrame: area.timeline.dropFrame
                maxMs: area.timeline.contentEndMs
                accessibleName: "Playhead timecode"
                onSeekRequested: ms => area.clock.seek(ms)
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
            Ui.ToolbarIconButton {
                objectName: "transportScrubAudio"
                iconName: area.clock.scrubAudio ? "volumeUp" : "volumeOffOutlined"
                anchors.verticalCenter: parent.verticalCenter
                active: area.clock.scrubAudio
                Accessible.checkable: true
                Accessible.checked: area.clock.scrubAudio
                accessibleName: "Play audio while scrubbing"
                shortcutText: "Shift+S"
                onClicked: area.clock.scrubAudio = !area.clock.scrubAudio
            }
            Ui.Text {
                objectName: "transportDuration"
                anchors.verticalCenter: parent.verticalCenter
                visible: area.width >= TimelineMetrics.transportDurationMinWidth
                text: "/" + TimelineFormat.timecode(area.timeline.contentEndMs, area.timeline.fps, area.timeline.dropFrame)
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
            }
            Ui.Text {
                objectName: "transportFps"
                anchors.verticalCenter: parent.verticalCenter
                visible: area.width >= TimelineMetrics.transportDurationMinWidth
                text: area.timeline.fps + " fps"
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
            }
            MonitorZoomMenu {
                anchors.verticalCenter: parent.verticalCenter
                monitor: viewState
            }
            Ui.ToolbarIconButton {
                objectName: "exportFrameButton"
                anchors.verticalCenter: parent.verticalCenter
                iconName: "photoCamera"
                accessibleName: "Export frame"
                description: "Export frame"
                enabled: area.gestures !== null
                onClicked: area.gestures.runAction("exportFrame", {monitor: "program"})
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
    }
    MonitorSettingsMenu {
        id: settingsMenu
        monitor: viewState
        views: area.monitorViews
    }
}

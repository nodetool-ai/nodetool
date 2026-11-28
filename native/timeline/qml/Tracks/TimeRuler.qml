pragma ComponentBehavior: Bound
// Mirrors web/src/components/timeline/Tracks/TimeRuler.tsx: the tick canvas
// above the lanes, scrolled with them. A press seeks; a drag that started
// here scrubs. The in/out range band and the marker lines are on the canvas;
// each marker glyph (MarkerOverlay) is an item over it: a click seeks and
// selects, a double-click or the context menu edits it, and the context menu
// clears it. A
// range marker (durationMs) also shows its length on the canvas.
import QtQuick
import QtQuick.Shapes
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: ruler
    required property TimelineViewState viewState
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property double fps: 30
    // Only markers intersecting the viewport and its overscan create flags.
    MarkerWindowModel {
        id: markerWindow
        retainWindow: true
        timeline: ruler.timeline
        fromMs: (ruler.viewState.scrollLeftPx - 200) * ruler.viewState.msPerPx
        toMs: (ruler.viewState.scrollLeftPx + ruler.width + 200) * ruler.viewState.msPerPx
    }
    property Item hoveredMarker: null
    Ui.Tooltip {
        objectName: "markerTooltip"
        trigger: ruler.hoveredMarker
        visible: ruler.hoveredMarker !== null
        text: ruler.hoveredMarker ? ruler.hoveredMarker.tooltipText : ""
    }
    signal seekRequested(real ms)
    // A press or drag on the ruler: the transport plays a short burst of audio.
    signal scrubRequested(real ms)
    signal deleteMarkerRequested(string markerId)

    objectName: "timeRuler"
    height: TimelineMetrics.rulerHeight
    color: Ui.Theme.surfacePanel
    clip: true
    Accessible.role: Accessible.Canvas
    Accessible.name: ruler.viewState.rulerMode === "bars"
        ? qsTr("Bars ruler — click or drag to set playhead")
        : qsTr("Time ruler — click or drag to set playhead")

    RulerCanvas {
        id: canvas
        objectName: "rulerCanvas"
        width: parent.width
        height: parent.height - Ui.Metrics.border
        timeline: ruler.timeline
        rulerMode: ruler.viewState.rulerMode
        gridDivision: ruler.viewState.gridDivision
        msPerPx: ruler.viewState.msPerPx
        scrollLeftPx: ruler.viewState.scrollLeftPx
        fps: ruler.fps
        background: Ui.Theme.surfacePanel
        textColor: Ui.Theme.textSecondary
        tickColor: Ui.Theme.borderSubtle
        font: Ui.Typography.font(Ui.Typography.MonoCaption)
        markerColor: Ui.Theme.accentPrimary
        rangeInMs: ruler.viewState.rangeInMs
        rangeOutMs: ruler.viewState.rangeOutMs
    }

    // borderBottom: 1px divider.
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: Ui.Metrics.border
        color: Ui.Theme.borderSubtle
    }

    MouseArea {
        objectName: "rulerSeekArea"
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        preventStealing: true
        property double lastScrubMs: -1
        function seekTo(mx, force) {
            const ms = Math.max(0, mx * ruler.viewState.msPerPx + ruler.viewState.scrollLeftPx * ruler.viewState.msPerPx)
            if (!force && ms === lastScrubMs) return
            lastScrubMs = ms
            ruler.scrubRequested(ms)
        }
        onPressed: mouse => {
            if (mouse.button === Qt.RightButton) {
                if (!ruler.rulerMenu) ruler.rulerMenu = rulerMenuComponent.createObject(ruler)
                if (!ruler.rulerMenu) return
                const px = mouse.x
                const py = mouse.y
                const context = { timeMs: ruler.viewState.timeAtViewportX(mouse.x), editable: true, kind: "ruler", gestures: ruler.gestures, rulerMode: ruler.viewState.rulerMode, hasMarkers: markerWindow.sourceCount > 0 }
                ruler.rulerMenu.retarget(this, anchor => {
                    ruler.rulerMenu.context = context
                    if (MenuRegistry.query("ruler", context).length > 0) ruler.rulerMenu.popupAt(anchor, px, py)
                })
            } else {
                MarkerSession.clearSelection()
                seekTo(mouse.x, true)
            }
        }
        onPositionChanged: mouse => {
            if (pressed && (pressedButtons & Qt.LeftButton)) seekTo(mouse.x, false)
        }
        onReleased: lastScrubMs = -1
        onCanceled: lastScrubMs = -1
    }

    property RegistryContextMenu rulerMenu: null
    property RegistryContextMenu markerMenu: null
    Component {
        id: rulerMenuComponent
        RegistryContextMenu { kind: "ruler"; gestures: ruler.gestures }
    }
    Component {
        id: markerMenuComponent
        RegistryContextMenu { kind: "marker"; gestures: ruler.gestures }
    }

    function closeSharedMenus() {
        if (rulerMenu) {
            rulerMenu.cancelRetarget()
            rulerMenu.close()
        }
        if (markerMenu) {
            markerMenu.cancelRetarget()
            markerMenu.close()
        }
    }
    Connections {
        target: ruler.viewState
        function onScrollLeftPxChanged() { ruler.closeSharedMenus() }
        function onMsPerPxChanged() { ruler.closeSharedMenus() }
    }
    // Marker flags, in content space, culled to the view with 200 px of
    // overscan. Over the seek area: a press on a flag never seeks the ruler.
    Item {
        objectName: "markerLayer"
        x: -ruler.viewState.scrollLeftPx
        width: parent.width
        height: parent.height
        Repeater {
            model: markerWindow
            // A marker is a small pentagon glyph centred on its time, as in Premiere.
            // The ruler draws no name, so a marker never covers the playhead or a
            // close neighbour. Hover shows the name, timecode and note.
            delegate: Item {
                id: flag
                // Typed row supplied by the window model.
                required property markerRow marker
                readonly property double contentPx: marker.timeMs / ruler.viewState.msPerPx
                readonly property string label: marker.label ? marker.label : "Marker"
                readonly property bool chosen: MarkerSession.selectedIds.indexOf(marker.id) >= 0
                readonly property double durationPx: (marker.durationMs ?? 0) / ruler.viewState.msPerPx
                readonly property color color: marker.color ? marker.color : Ui.Theme.accentPrimary
                objectName: "timelineMarker"
                readonly property bool glyphInViewport: contentPx + width / 2 >= ruler.viewState.scrollLeftPx
                    && contentPx - width / 2 <= ruler.viewState.scrollLeftPx + ruler.width
                visible: true
                width: Ui.Metrics.md
                height: ruler.height * 0.34
                x: contentPx - width / 2
                y: Ui.Metrics.border
                Accessible.role: Accessible.Button
                Accessible.name: label + (marker.note ? ", " + marker.note : "")
                Accessible.selected: chosen
                Accessible.ignored: !glyphInViewport
                Shape {
                    objectName: "markerGlyph"
                    visible: flag.glyphInViewport
                    anchors.fill: parent
                    preferredRendererType: Shape.CurveRenderer
                    ShapePath {
                        fillColor: flag.color
                        strokeColor: flag.chosen ? Ui.Theme.textPrimary : "transparent"
                        strokeWidth: flag.chosen ? Ui.Metrics.border : 0
                        startX: 0; startY: 0
                        PathLine { x: flag.width; y: 0 }
                        PathLine { x: flag.width; y: flag.height * 0.65 }
                        PathLine { x: flag.width / 2; y: flag.height }
                        PathLine { x: 0; y: flag.height * 0.65 }
                        PathLine { x: 0; y: 0 }
                    }
                }
                readonly property string tooltipText: flagHover.hovered
                    ? flag.label + "  " + MarkerSession.timecode(flag.marker.timeMs, ruler.fps)
                        + (flag.marker.note ? "\n" + flag.marker.note : "") : ""
                HoverHandler {
                    id: flagHover
                    enabled: flag.glyphInViewport
                    cursorShape: Qt.PointingHandCursor
                    onHoveredChanged: {
                        if (hovered) {
                            ruler.hoveredMarker = flag
                        } else if (ruler.hoveredMarker === flag) { ruler.hoveredMarker = null }
                    }
                }
                Component.onDestruction: if (ruler.hoveredMarker === flag) { ruler.hoveredMarker = null }
                // A range marker shows its name inside the bar, as in Premiere. The name is
                // elided to the span and is hidden when less than a few characters fit.
                Loader {
                    id: rangeLabel
                    objectName: "markerRangeLabel"
                    // Keep semantic text available while its renderer is unloaded.
                    readonly property string text: flag.label
                    readonly property double room: flag.durationPx - flag.width / 2 - Ui.Metrics.xs
                    active: flag.durationPx > 0 && room >= Ui.Metrics.xl
                    visible: active
                    x: flag.width + Ui.Metrics.micro
                    width: Math.max(0, room)
                    height: flag.height
                    sourceComponent: Ui.Text {
                        role: Ui.Typography.SansCaption
                        text: rangeLabel.text
                        elide: Text.ElideRight
                        verticalAlignment: Text.AlignVCenter
                    }
                }
                // A range marker has a grip at its end. Dragging it resizes the range, and the
                // release is one undo entry. Point markers and markers out of view build no grip.
                Loader {
                    active: flag.durationPx > 0 && flag.visible
                    sourceComponent: MouseArea {
                        id: grip
                        objectName: "markerRangeGrip"
                        // The length being dragged in ms, or -1 while no drag is under way.
                        property double draftMs: -1
                        function msAt(mouseX) {
                            const at = ruler.viewState.timeAtViewportX(mapToItem(ruler, mouseX, 0).x)
                            return Math.max(0, Math.round(at - flag.marker.timeMs))
                        }
                        x: flag.width / 2 + flag.durationPx - width / 2
                        y: -flag.y
                        width: Ui.Metrics.md
                        height: ruler.height
                        enabled: pressed || flag.contentPx + flag.durationPx >= ruler.viewState.scrollLeftPx - width / 2
                            && flag.contentPx + flag.durationPx <= ruler.viewState.scrollLeftPx + ruler.width + width / 2
                        cursorShape: Qt.SizeHorCursor
                        preventStealing: true
                        onPressed: mouse => { draftMs = msAt(mouse.x) }
                        onPositionChanged: mouse => { if (pressed) draftMs = msAt(mouse.x) }
                        onReleased: mouse => {
                            const ms = msAt(mouse.x)
                            draftMs = -1
                            if (ms !== flag.marker.durationMs && ruler.timeline)
                                ruler.timeline.applyEdit("markers.update", { ids: [flag.marker.id], patch: { durationMs: ms } })
                        }
                        onCanceled: draftMs = -1
                        // The range as dragged, from the marker's time.
                        Rectangle {
                            objectName: "markerRangeDraft"
                            visible: grip.draftMs >= 0
                            x: grip.width / 2 - flag.durationPx
                            width: grip.draftMs / ruler.viewState.msPerPx
                            height: parent.height
                            color: flag.color
                            opacity: 0.35
                        }
                        Rectangle {
                            anchors.centerIn: parent
                            width: Ui.Metrics.xs
                            height: parent.height - Ui.Metrics.md
                            radius: Ui.Metrics.micro
                            color: flag.color
                            visible: gripHover.hovered || grip.pressed
                        }
                        HoverHandler { id: gripHover }
                    }
                }
                // The seek target reaches 20 px down (MARKER_HIT_HEIGHT_PX).
                // Alt/Option+drag sets the duration from the marker's time, as in Premiere.
                // The release is one undo entry, and a drag to the marker's time clears the range.
                MouseArea {
                    id: seekArea
                    objectName: "markerSeek"
                    enabled: flag.glyphInViewport || pressed
                    anchors.fill: parent
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    preventStealing: true
                    // The length being Alt-dragged in ms, or -1 while no Alt drag is under way.
                    property double altDraftMs: -1
                    // Set by the release of an Alt drag, so the click after it does not seek.
                    property bool suppressClick: false
                    function altMsAt(mouseX) {
                        const at = ruler.viewState.timeAtViewportX(mapToItem(ruler, mouseX, 0).x)
                        return Math.max(0, Math.round(at - flag.marker.timeMs))
                    }
                    onPressed: mouse => {
                        if (mouse.button === Qt.LeftButton && (mouse.modifiers & Qt.AltModifier)) altDraftMs = altMsAt(mouse.x)
                    }
                    onPositionChanged: mouse => { if (altDraftMs >= 0) altDraftMs = altMsAt(mouse.x) }
                    onReleased: mouse => {
                        if (altDraftMs < 0) return
                        const ms = altMsAt(mouse.x)
                        altDraftMs = -1
                        if (ms !== (flag.marker.durationMs ?? 0) && ruler.timeline)
                            ruler.timeline.applyEdit("markers.update", { ids: [flag.marker.id], patch: { durationMs: ms } })
                        suppressClick = true
                    }
                    onCanceled: altDraftMs = -1
                    Rectangle {
                        objectName: "markerAltDraft"
                        visible: seekArea.altDraftMs >= 0
                        x: flag.width / 2
                        y: -flag.y
                        width: seekArea.altDraftMs / ruler.viewState.msPerPx
                        height: ruler.height
                        color: flag.color
                        opacity: 0.35
                    }
                    onClicked: mouse => {
                        if (suppressClick) { suppressClick = false; return }
                        if (mouse.button === Qt.RightButton) {
                            if (!flag.chosen) MarkerSession.select(flag.marker.id)
                            if (!ruler.markerMenu) ruler.markerMenu = markerMenuComponent.createObject(ruler)
                            if (!ruler.markerMenu) return
                            const px = mouse.x
                            const py = mouse.y
                            const context = { markerId: flag.marker.id, timeMs: flag.marker.timeMs, color: flag.marker.color ?? "", editable: true }
                            ruler.markerMenu.retarget(this, anchor => {
                                ruler.markerMenu.context = context
                                ruler.markerMenu.popupAt(anchor, px, py)
                            })
                        } else {
                            MarkerSession.select(flag.marker.id, (mouse.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) !== 0)
                            if (!(mouse.modifiers & (Qt.ControlModifier | Qt.MetaModifier))) ruler.seekRequested(flag.marker.timeMs)
                        }
                    }
                    onDoubleClicked: mouse => {
                        if (mouse.button === Qt.LeftButton) MarkerSession.requestEdit(flag.marker.id)
                    }
                }
            }
        }
    }
}

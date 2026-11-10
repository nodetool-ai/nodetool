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
    // The document's markers ({id, timeMs, label, color?, note?, durationMs?, author?}).
    property var markers: []
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
        markers: ruler.markers
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
        function seekTo(mx) {
            ruler.scrubRequested(Math.max(0, mx * ruler.viewState.msPerPx + ruler.viewState.scrollLeftPx * ruler.viewState.msPerPx))
        }
        onPressed: mouse => {
            if (mouse.button === Qt.RightButton) {
                rulerMenu.context = { timeMs: ruler.viewState.timeAtViewportX(mouse.x), editable: true, kind: "ruler", gestures: ruler.gestures, rulerMode: ruler.viewState.rulerMode, hasMarkers: ruler.markers.length > 0 }
                if (MenuRegistry.query("ruler", rulerMenu.context).length > 0) rulerMenu.popupAt(this, mouse.x, mouse.y)
            } else {
                MarkerSession.clearSelection()
                seekTo(mouse.x)
            }
        }
        onPositionChanged: mouse => {
            if (pressed && (pressedButtons & Qt.LeftButton)) seekTo(mouse.x)
        }
    }

    RegistryContextMenu {
        id: rulerMenu
        kind: "ruler"
        gestures: ruler.gestures
    }
    RegistryContextMenu {
        id: markerMenu
        kind: "marker"
        gestures: ruler.gestures
    }

    // Marker flags, in content space, culled to the view with 200 px of
    // overscan. Over the seek area: a press on a flag never seeks the ruler.
    Item {
        objectName: "markerLayer"
        x: -ruler.viewState.scrollLeftPx
        width: parent.width
        height: parent.height
        Repeater {
            model: ruler.markers
            // A marker is a small pentagon glyph centred on its time, as in Premiere.
            // The ruler draws no name, so a marker never covers the playhead or a
            // close neighbour. Hover shows the name, timecode and note.
            delegate: Item {
                id: flag
                required property var modelData
                readonly property double contentPx: modelData.timeMs / ruler.viewState.msPerPx
                readonly property string label: modelData.label ? modelData.label : "Marker"
                readonly property bool chosen: MarkerSession.selectedIds.indexOf(modelData.id) >= 0
                readonly property double durationPx: (modelData.durationMs ?? 0) / ruler.viewState.msPerPx
                readonly property color color: modelData.color ? modelData.color : Ui.Theme.accentPrimary
                objectName: "timelineMarker"
                visible: contentPx >= ruler.viewState.scrollLeftPx - 200
                         && contentPx <= ruler.viewState.scrollLeftPx + ruler.width + 200
                width: Ui.Metrics.md
                height: ruler.height * 0.34
                x: contentPx - width / 2
                y: Ui.Metrics.border
                Accessible.role: Accessible.Button
                Accessible.name: label + (modelData.note ? ", " + modelData.note : "")
                Accessible.selected: chosen
                Shape {
                    objectName: "markerGlyph"
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
                Ui.Tooltip {
                    objectName: "markerTooltip"
                    trigger: flag
                    visible: flagHover.hovered
                    text: flag.label + "  " + MarkerSession.timecode(flag.modelData.timeMs, ruler.fps)
                          + (flag.modelData.note ? "\n" + flag.modelData.note : "")
                }
                HoverHandler { id: flagHover; cursorShape: Qt.PointingHandCursor }
                // A range marker shows its name inside the bar, as in Premiere. The name is
                // elided to the span and is hidden when less than a few characters fit.
                Ui.Text {
                    objectName: "markerRangeLabel"
                    role: Ui.Typography.SansCaption
                    readonly property double room: flag.durationPx - flag.width / 2 - Ui.Metrics.xs
                    visible: flag.durationPx > 0 && room >= Ui.Metrics.xl
                    x: flag.width + Ui.Metrics.micro
                    width: Math.max(0, room)
                    anchors.verticalCenter: parent.verticalCenter
                    text: flag.label
                    elide: Text.ElideRight
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
                            return Math.max(0, Math.round(at - flag.modelData.timeMs))
                        }
                        x: flag.width / 2 + flag.durationPx - width / 2
                        y: -flag.y
                        width: Ui.Metrics.md
                        height: ruler.height
                        cursorShape: Qt.SizeHorCursor
                        preventStealing: true
                        onPressed: mouse => { draftMs = msAt(mouse.x) }
                        onPositionChanged: mouse => { if (pressed) draftMs = msAt(mouse.x) }
                        onReleased: mouse => {
                            const ms = msAt(mouse.x)
                            draftMs = -1
                            if (ms !== flag.modelData.durationMs && ruler.timeline)
                                ruler.timeline.applyEdit("markers.update", { ids: [flag.modelData.id], patch: { durationMs: ms } })
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
                    anchors.fill: parent
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    preventStealing: true
                    // The length being Alt-dragged in ms, or -1 while no Alt drag is under way.
                    property double altDraftMs: -1
                    // Set by the release of an Alt drag, so the click after it does not seek.
                    property bool suppressClick: false
                    function altMsAt(mouseX) {
                        const at = ruler.viewState.timeAtViewportX(mapToItem(ruler, mouseX, 0).x)
                        return Math.max(0, Math.round(at - flag.modelData.timeMs))
                    }
                    onPressed: mouse => {
                        if (mouse.button === Qt.LeftButton && (mouse.modifiers & Qt.AltModifier)) altDraftMs = altMsAt(mouse.x)
                    }
                    onPositionChanged: mouse => { if (altDraftMs >= 0) altDraftMs = altMsAt(mouse.x) }
                    onReleased: mouse => {
                        if (altDraftMs < 0) return
                        const ms = altMsAt(mouse.x)
                        altDraftMs = -1
                        if (ms !== (flag.modelData.durationMs ?? 0) && ruler.timeline)
                            ruler.timeline.applyEdit("markers.update", { ids: [flag.modelData.id], patch: { durationMs: ms } })
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
                            if (!flag.chosen) MarkerSession.select(flag.modelData.id)
                            markerMenu.context = { markerId: flag.modelData.id, timeMs: flag.modelData.timeMs, color: flag.modelData.color ?? "", editable: true }
                            markerMenu.popupAt(this, mouse.x, mouse.y)
                        } else {
                            MarkerSession.select(flag.modelData.id, (mouse.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) !== 0)
                            if (!(mouse.modifiers & (Qt.ControlModifier | Qt.MetaModifier))) ruler.seekRequested(flag.modelData.timeMs)
                        }
                    }
                    onDoubleClicked: mouse => {
                        if (mouse.button === Qt.LeftButton) MarkerSession.requestEdit(flag.modelData.id)
                    }
                }
            }
        }
    }
}

// Mirrors web/src/components/timeline/Tracks/TimeRuler.tsx: the tick canvas
// above the lanes, scrolled with them. A press seeks; a drag that started
// here scrubs. The in/out range band and the marker lines are on the canvas;
// each marker flag (MarkerOverlay) is an item over it: its label seeks and
// selects, a double-click or the context menu edits it, its x deletes it. A
// range marker (durationMs) also shows its length on the canvas.
import QtQuick
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
                rulerMenu.context = { timeMs: ruler.viewState.timeAtViewportX(mouse.x), editable: true, kind: "ruler", gestures: ruler.gestures, rulerMode: ruler.viewState.rulerMode }
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
            delegate: Rectangle {
                id: flag
                required property var modelData
                readonly property double contentPx: modelData.timeMs / ruler.viewState.msPerPx
                readonly property string label: modelData.label ? modelData.label : "Marker"
                readonly property bool chosen: MarkerSession.selectedIds.indexOf(modelData.id) >= 0
                readonly property double durationPx: (modelData.durationMs ?? 0) / ruler.viewState.msPerPx
                objectName: "timelineMarker"
                visible: contentPx >= ruler.viewState.scrollLeftPx - 200
                         && contentPx <= ruler.viewState.scrollLeftPx + ruler.width + 200
                x: contentPx - 1
                height: 14                                  // MARKER_FLAG_HEIGHT_PX
                width: Math.min(140, flagRow.implicitWidth + 2 * Ui.Metrics.xs)
                color: modelData.color ? modelData.color : Ui.Theme.accentPrimary
                topRightRadius: Ui.Metrics.micro
                bottomRightRadius: Ui.Metrics.micro
                border.width: chosen ? Ui.Metrics.border : 0
                border.color: Ui.Theme.textPrimary
                Accessible.role: Accessible.Button
                Accessible.name: label + (modelData.note ? ", " + modelData.note : "")
                Accessible.selected: chosen
                Row {
                    id: flagRow
                    x: Ui.Metrics.xs
                    height: parent.height
                    spacing: Ui.Metrics.micro
                    Ui.Text {
                        id: flagLabel
                        objectName: "markerLabel"
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.min(implicitWidth, 140 - 2 * Ui.Metrics.xs - (deleteText.visible ? deleteText.implicitWidth + Ui.Metrics.micro : 0))
                        elide: Text.ElideRight
                        text: flag.label
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.OnAccent
                    }
                    Ui.ToolbarIconButton {
                        id: deleteText
                        objectName: "markerDelete"
                        visible: flagHover.hovered || activeFocus
                        anchors.verticalCenter: parent.verticalCenter
                        width: Ui.Metrics.small
                        height: Ui.Metrics.small
                        iconName: "close"
                        iconTone: Ui.Text.OnAccent
                        accessibleName: "Delete marker " + flag.label
                        onClicked: ruler.deleteMarkerRequested(flag.modelData.id)
                    }
                }
                HoverHandler { id: flagHover; cursorShape: Qt.PointingHandCursor }
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
                        x: flag.durationPx + Ui.Metrics.border - width / 2
                        y: 0
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
                MouseArea {
                    objectName: "markerSeek"
                    width: flagLabel.width + Ui.Metrics.xs
                    height: 20
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    onClicked: mouse => {
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

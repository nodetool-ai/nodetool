// Mirrors web/src/components/timeline/Tracks/TimeRuler.tsx: the tick canvas
// above the lanes, scrolled with them. A press seeks; a drag that started
// here scrubs. The in/out range band and the marker lines are on the canvas;
// each marker flag (MarkerOverlay) is an item over it: its label seeks, its
// x deletes it.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: ruler
    required property TimelineViewState viewState
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property double fps: 30
    // The document's markers ({id, timeMs, label, color?}).
    property var markers: []
    signal seekRequested(real ms)
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
            ruler.seekRequested(Math.max(0, mx * ruler.viewState.msPerPx + ruler.viewState.scrollLeftPx * ruler.viewState.msPerPx))
        }
        onPressed: mouse => {
            if (mouse.button === Qt.RightButton) {
                rulerMenu.context = { timeMs: ruler.viewState.timeAtViewportX(mouse.x), editable: true }
                if (MenuRegistry.query("ruler", rulerMenu.context).length > 0) rulerMenu.popup(mouse.x, mouse.y)
            } else seekTo(mouse.x)
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
                objectName: "timelineMarker"
                visible: contentPx >= ruler.viewState.scrollLeftPx - 200
                         && contentPx <= ruler.viewState.scrollLeftPx + ruler.width + 200
                x: contentPx - 1
                height: 14                                  // MARKER_FLAG_HEIGHT_PX
                width: Math.min(140, flagRow.implicitWidth + 2 * Ui.Metrics.xs)
                color: modelData.color ? modelData.color : Ui.Theme.accentPrimary
                topRightRadius: Ui.Metrics.micro
                bottomRightRadius: Ui.Metrics.micro
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
                // The seek target reaches 20 px down (MARKER_HIT_HEIGHT_PX).
                MouseArea {
                    objectName: "markerSeek"
                    width: flagLabel.width + Ui.Metrics.xs
                    height: 20
                    onClicked: ruler.seekRequested(flag.modelData.timeMs)
                }
            }
        }
    }
}

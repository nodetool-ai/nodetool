// Mirrors web/src/components/timeline/Tracks/TimeRuler.tsx: the tick canvas
// above the lanes, scrolled with them. A press seeks; a drag that started
// here scrubs. The in/out range band and the marker lines are on the canvas;
// each marker flag (MarkerOverlay) is an item over it: its label seeks, its
// x deletes it.
import QtQuick
import NodeTool.Timeline

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
    height: Theme.rulerHeight
    color: Theme.backgroundPaper
    clip: true
    Accessible.role: Accessible.Canvas
    Accessible.name: ruler.viewState.rulerMode === "bars"
        ? qsTr("Bars ruler — click or drag to set playhead")
        : qsTr("Time ruler — click or drag to set playhead")

    RulerCanvas {
        id: canvas
        objectName: "rulerCanvas"
        width: parent.width
        height: parent.height - 1
        timeline: ruler.timeline
        rulerMode: ruler.viewState.rulerMode
        gridDivision: ruler.viewState.gridDivision
        msPerPx: ruler.viewState.msPerPx
        scrollLeftPx: ruler.viewState.scrollLeftPx
        fps: ruler.fps
        background: Theme.backgroundPaper
        textColor: Theme.textSecondary
        tickColor: Theme.divider
        font.family: Theme.monoFamily
        font.pixelSize: Theme.fontSizeSmaller
        markerColor: Theme.primary
        rangeInMs: ruler.viewState.rangeInMs
        rangeOutMs: ruler.viewState.rangeOutMs
        markers: ruler.markers
    }

    // borderBottom: 1px divider.
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.divider
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
                width: Math.min(140, flagRow.implicitWidth + 2 * Theme.spacingXs)
                color: modelData.color ? modelData.color : Theme.primary
                topRightRadius: Theme.radiusXs
                bottomRightRadius: Theme.radiusXs
                Row {
                    id: flagRow
                    x: Theme.spacingXs
                    height: parent.height
                    spacing: Theme.spacingMicro
                    Text {
                        id: flagLabel
                        objectName: "markerLabel"
                        anchors.verticalCenter: parent.verticalCenter
                        width: Math.min(implicitWidth, 140 - 2 * Theme.spacingXs - (deleteText.visible ? deleteText.implicitWidth + Theme.spacingMicro : 0))
                        elide: Text.ElideRight
                        text: flag.label
                        color: "#ffffff"                    // primary.contrastText
                        font.family: Theme.monoFamily
                        font.pixelSize: Theme.fontSizeSmaller
                    }
                    Text {
                        id: deleteText
                        objectName: "markerDelete"
                        visible: flagHover.hovered
                        anchors.verticalCenter: parent.verticalCenter
                        text: "\u00d7"
                        color: "#ffffff"
                        font.family: Theme.monoFamily
                        font.pixelSize: Theme.fontSizeSmaller
                        TapHandler { onTapped: ruler.deleteMarkerRequested(flag.modelData.id) }
                    }
                }
                HoverHandler { id: flagHover; cursorShape: Qt.PointingHandCursor }
                // The seek target reaches 20 px down (MARKER_HIT_HEIGHT_PX).
                MouseArea {
                    objectName: "markerSeek"
                    width: flagLabel.width + Theme.spacingXs
                    height: 20
                    onClicked: ruler.seekRequested(flag.modelData.timeMs)
                }
            }
        }
    }
}

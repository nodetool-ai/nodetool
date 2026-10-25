// Mirrors web/src/components/timeline/Tracks/TimeRuler.tsx: the tick canvas
// above the lanes, scrolled with them. A press seeks; a drag that started
// here scrubs.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: ruler
    required property TimelineViewState viewState
    property double fps: 30
    signal seekRequested(real ms)

    objectName: "timeRuler"
    height: Theme.rulerHeight
    color: Theme.backgroundPaper
    clip: true

    RulerCanvas {
        id: canvas
        objectName: "rulerCanvas"
        width: parent.width
        height: parent.height - 1
        msPerPx: ruler.viewState.msPerPx
        scrollLeftPx: ruler.viewState.scrollLeftPx
        fps: ruler.fps
        background: Theme.backgroundPaper
        textColor: Theme.textSecondary
        tickColor: Theme.divider
        font.family: Theme.monoFamily
        font.pixelSize: Theme.fontSizeSmaller
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
        acceptedButtons: Qt.LeftButton
        preventStealing: true
        function seekTo(mx) {
            ruler.seekRequested(Math.max(0, mx * ruler.viewState.msPerPx + ruler.viewState.scrollLeftPx * ruler.viewState.msPerPx))
        }
        onPressed: mouse => seekTo(mouse.x)
        onPositionChanged: mouse => {
            if (pressed) seekTo(mouse.x)
        }
    }
}

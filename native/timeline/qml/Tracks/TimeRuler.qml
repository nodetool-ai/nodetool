// Mirrors web/src/components/timeline/Tracks/TimeRuler.tsx: second ticks with
// labels, scrolled with the lanes. Click or drag to seek.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: ruler
    property real pxPerMs: 0.06
    property real contentX: 0
    property real durationMs: 0
    signal seekRequested(real ms)

    color: Theme.panel
    clip: true

    // Tick spacing in seconds that keeps labels at least 60 px apart.
    readonly property real stepSec: {
        const steps = [0.5, 1, 2, 5, 10, 30, 60]
        for (const s of steps) {
            if (s * 1000 * pxPerMs >= 60) return s
        }
        return 120
    }

    Repeater {
        model: Math.floor(ruler.durationMs / 1000 / ruler.stepSec) + 1
        delegate: Item {
            required property int index
            readonly property real sec: index * ruler.stepSec
            x: sec * 1000 * ruler.pxPerMs - ruler.contentX
            height: ruler.height
            Rectangle {
                y: parent.height - 8
                width: 1
                height: 8
                color: Theme.textMuted
            }
            Text {
                x: 4
                y: 4
                text: Theme.timecode(parent.sec * 1000, 30).slice(0, 5)
                color: Theme.textMuted
                font.pixelSize: 10
                font.family: "Menlo"
            }
        }
    }

    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.divider
    }

    MouseArea {
        anchors.fill: parent
        function seekTo(mx) {
            ruler.seekRequested(Math.max(0, (mx + ruler.contentX) / ruler.pxPerMs))
        }
        onPressed: mouse => seekTo(mouse.x)
        onPositionChanged: mouse => seekTo(mouse.x)
    }
}

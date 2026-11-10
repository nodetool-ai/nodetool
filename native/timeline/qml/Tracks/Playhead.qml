// Mirrors web/src/components/timeline/Tracks/Playhead.tsx: a 1.5 px
// secondary line with a timecode pill at the top, and a 16 px grab zone below
// the ruler. Its x is the only thing that follows the clock (D30): a move
// touches no model, no lane and not the ruler.
import QtQuick
import QtQuick.Shapes
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: playhead
    required property PlaybackClock clock
    required property TimelineViewState viewState
    property double fps: 30
    // Height of the band at the top that does not grab (the ruler).
    property double grabTopPx: TimelineMetrics.rulerHeight
    // Content end; a drag stops there.
    property double endMs: 0
    // The lanes' viewport width, so the pill stays whole at the edges.
    property double viewportWidthPx: 0
    property Item passthroughRoot: null

    function passthroughAt(target, point) {
        if (!target.visible || !target.enabled || (target.clip && !target.contains(point))) return false
        const marker = target.playheadPassthrough
        if ((marker === true && target.contains(point))
            || (typeof marker === "function" && marker(point))) return true
        for (let i = target.children.length - 1; i >= 0; --i) {
            const child = target.children[i]
            if (passthroughAt(child, child.mapFromItem(target, point.x, point.y))) return true
        }
        return false
    }

    readonly property double lineLeftPx: clock.time / viewState.msPerPx - viewState.scrollLeftPx
    // Follow playhead (followPlayhead.ts): while playing, page the lanes when
    // the line leaves [0, 95 %] of the view, so it sits at 10 % again. Only a
    // page jump moves the scroll.
    property bool follow: false
    onLineLeftPxChanged: {
        if (!follow || !clock.playing || viewportWidthPx <= 0) return
        if (lineLeftPx >= 0 && lineLeftPx <= viewportWidthPx * 0.95) return
        // After this change settles: the page jump moves lineLeftPx again.
        Qt.callLater(playhead.followPage)
    }
    function followPage() {
        if (lineLeftPx >= 0 && lineLeftPx <= viewportWidthPx * 0.95) return
        viewState.scrollLeftPx = Math.max(0, clock.time / viewState.msPerPx - viewportWidthPx * 0.1)
    }

    objectName: "playhead"
    x: lineLeftPx - 8                       // HIT_AREA_WIDTH_PX / 2
    width: 16
    z: TimelineMetrics.playheadLayer

    // The line: 1 px blue.
    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        width: 1                            // LINE_WIDTH_PX
        height: parent.height
        color: TimelineVisuals.editBlue
    }

    // The head: a blue pentagon over the ruler ticks, its point on the line at
    // the bottom of the ruler, as in Premiere. The timecode reads in the track
    // header corner.
    Shape {
        id: pill
        objectName: "playheadPill"
        readonly property string timecode: TimelineFormat.playheadTimecode(playhead.clock.time, playhead.fps)
        x: (playhead.width - width) / 2
        y: playhead.grabTopPx - height
        width: 15
        height: 16
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            fillColor: TimelineVisuals.editBlue
            strokeColor: "transparent"
            startX: 0; startY: 0
            PathLine { x: pill.width; y: 0 }
            PathLine { x: pill.width; y: pill.height * 0.55 }
            PathLine { x: pill.width / 2; y: pill.height }
            PathLine { x: 0; y: pill.height * 0.55 }
            PathLine { x: 0; y: 0 }
        }
    }

    // The grab zone: jump-and-grab drag along the line, below the ruler.
    MouseArea {
        objectName: "playheadGrab"
        y: playhead.grabTopPx
        width: parent.width
        height: Math.max(0, parent.height - playhead.grabTopPx)
        acceptedButtons: Qt.LeftButton
        preventStealing: true
        cursorShape: pressed ? Qt.ClosedHandCursor : Qt.SizeHorCursor
        property double startSceneX: 0
        property double startMs: 0
        onPressed: mouse => {
            if (playhead.passthroughRoot && playhead.passthroughAt(playhead.passthroughRoot,
                mapToItem(playhead.passthroughRoot, mouse.x, mouse.y))) {
                mouse.accepted = false
                return
            }
            startSceneX = mapToItem(null, mouse.x, 0).x
            startMs = playhead.clock.time
        }
        onPositionChanged: mouse => {
            if (!pressed) return
            const deltaMs = (mapToItem(null, mouse.x, 0).x - startSceneX) * playhead.viewState.msPerPx
            const cap = playhead.endMs > 0 ? playhead.endMs : Number.MAX_SAFE_INTEGER
            playhead.clock.scrub(Math.max(0, Math.min(cap, startMs + deltaMs)))
        }
        onCanceled: playhead.clock.seek(startMs)
    }
}

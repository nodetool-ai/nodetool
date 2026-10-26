// Mirrors web/src/components/timeline/Tracks/Playhead.tsx: a 1.5 px
// secondary line with a timecode pill at the top, and a 16 px grab zone below
// the ruler. Its x is the only thing that follows the clock (D30): a move
// touches no model, no lane and not the ruler.
import QtQuick
import NodeTool.Timeline

Item {
    id: playhead
    required property PlaybackClock clock
    required property TimelineViewState viewState
    property double fps: 30
    // Height of the band at the top that does not grab (the ruler).
    property double grabTopPx: Theme.rulerHeight
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
    z: 10

    // The line and its glow (boxShadow 0 0 10px secondary/40%).
    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        width: 7
        height: parent.height
        color: Qt.rgba(Theme.secondary.r, Theme.secondary.g, Theme.secondary.b, 0.12)
    }
    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        width: 1.5                          // LINE_WIDTH_PX
        height: parent.height
        color: Theme.secondary
        antialiasing: true
    }

    Rectangle {
        id: pill
        objectName: "playheadPill"
        y: 4
        height: 20                          // PILL_HEIGHT_PX
        width: pillText.implicitWidth + 2 * Theme.spacingMd
        radius: 10
        color: Theme.secondary
        x: (playhead.width - width) / 2 + Math.round(TimelineFormat.pillShift(playhead.lineLeftPx, width, playhead.viewportWidthPx))
        Text {
            id: pillText
            anchors.centerIn: parent
            text: TimelineFormat.playheadTimecode(playhead.clock.time, playhead.fps)
            color: Theme.secondaryContrast
            font.family: Theme.monoFamily
            font.pixelSize: Theme.fontSizeSmaller
            font.weight: Font.DemiBold
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
            playhead.clock.seek(Math.max(0, Math.min(cap, startMs + deltaMs)))
        }
    }
}

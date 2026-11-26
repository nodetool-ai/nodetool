pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: bracket
    property string clipId: ""
    property real startMs: 0
    property real durationMs: 0
    property real widthPx: 0
    property real spanStartMs: NaN
    property real spanEndMs: NaN
    function toPx(ms) {
        return Math.max(0, Math.min(widthPx, (ms - startMs) / durationMs * widthPx));
    }
    readonly property real bracketLeft: isNaN(spanStartMs) ? 0 : toPx(spanStartMs)
    readonly property real bracketRight: isNaN(spanEndMs) ? widthPx : toPx(spanEndMs)
    visible: durationMs > 0 && widthPx > 0
    x: bracketLeft
    y: Ui.Metrics.xl
    width: Math.max(1, bracketRight - bracketLeft)
    height: Ui.Metrics.md
    opacity: 0.7
    Accessible.ignored: true
    Rectangle {
        width: parent.width
        height: 1
        color: TimelineVisuals.overlay
    }
    Rectangle {
        width: 1
        height: parent.height
        color: TimelineVisuals.overlay
    }
    Rectangle {
        x: parent.width - width
        width: 1
        height: parent.height
        color: TimelineVisuals.overlay
    }
}

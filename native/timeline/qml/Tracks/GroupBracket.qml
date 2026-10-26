import QtQuick
import NodeTool.Timeline

Item {
    id: bracket
    property string clipId: ""
    property real startMs: 0
    property real durationMs: 0
    property real widthPx: 0
    property var spanStartMs: null
    property var spanEndMs: null
    function toPx(ms) {
        return Math.max(0, Math.min(widthPx, (ms - startMs) / durationMs * widthPx));
    }
    readonly property real bracketLeft: spanStartMs === null ? 0 : toPx(spanStartMs)
    readonly property real bracketRight: spanEndMs === null ? widthPx : toPx(spanEndMs)
    visible: durationMs > 0 && widthPx > 0
    x: bracketLeft
    y: Theme.spacingXl
    width: Math.max(1, bracketRight - bracketLeft)
    height: Theme.spacingMd
    opacity: 0.7
    Accessible.ignored: true
    Rectangle {
        width: parent.width
        height: 1
        color: Theme.secondary
    }
    Rectangle {
        width: 1
        height: parent.height
        color: Theme.secondary
    }
    Rectangle {
        x: parent.width - width
        width: 1
        height: parent.height
        color: Theme.secondary
    }
}

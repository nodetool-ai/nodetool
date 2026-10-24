// Mirrors web/src/components/timeline/preview/PreviewArea.tsx: hosts the
// compositor, letterboxed to the canvas aspect ratio.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: area
    required property TimelineModel timeline
    required property PlaybackClock clock

    color: "#0a0a0c"
    clip: true

    readonly property real canvasAspect: timeline.canvasWidth / timeline.canvasHeight

    PreviewCompositor {
        objectName: "previewCompositor"
        anchors.centerIn: parent
        width: Math.min(area.width - 16, (area.height - 16) * area.canvasAspect)
        height: width / area.canvasAspect
        timeline: area.timeline
        clock: area.clock
    }
}

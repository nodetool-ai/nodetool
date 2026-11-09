pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "EffectControlsModel.js" as Model
// The panel's own time ruler over the clip's stretch of the sequence. A press or drag moves the playhead.
Rectangle {
    id: root
    required property var panel
    color: Ui.Theme.surfacePanel
    clip: true
    Accessible.role: Accessible.Slider
    Accessible.name: "Effect Controls time ruler, press or drag to move the playhead"
    Canvas {
        id: ticks
        anchors.fill: parent
        readonly property var view: [root.panel.scrollMs, root.panel.pxPerMs, root.panel.clipStartMs, root.panel.durationMs, root.panel.fps, width]
        onViewChanged: requestPaint()
        onPaint: {
            const ctx = getContext("2d")
            ctx.reset()
            ctx.font = Ui.Typography.canvasFont(Ui.Typography.MonoCaption)
            const start = root.panel.clipStartMs
            const fromMs = start + root.panel.scrollMs
            const inset = root.panel.laneInset
            const list = Model.rulerTicks(fromMs, fromMs + root.panel.visibleMs, fromMs - inset / root.panel.pxPerMs, root.panel.pxPerMs, root.panel.fps)
            ctx.strokeStyle = Ui.Theme.borderControl
            ctx.fillStyle = Ui.Theme.textSecondary
            ctx.lineWidth = Ui.Metrics.border
            ctx.beginPath()
            for (const tick of list) {
                const x = Math.round(tick.x) + 0.5
                ctx.moveTo(x, height)
                ctx.lineTo(x, height - (tick.major ? Ui.Metrics.md : Ui.Metrics.xs))
            }
            ctx.stroke()
            for (const tick of list) {
                if (tick.major) ctx.fillText(TimelineFormat.playheadTimecode(tick.ms, root.panel.fps), tick.x + Ui.Metrics.xs, Ui.Metrics.lg)
            }
        }
    }
    MouseArea {
        id: scrub
        objectName: "effectControlsRulerArea"
        anchors.fill: parent
        preventStealing: true
        cursorShape: Qt.SizeHorCursor
        onPressed: mouse => root.panel.seekClipTime(root.panel.msAtX(mouse.x))
        onPositionChanged: mouse => { if (pressed) root.panel.seekClipTime(root.panel.msAtX(mouse.x)) }
    }
    Rectangle {
        objectName: "effectControlsPlayheadHandle"
        readonly property real playhead: root.panel.controller.playheadMs
        visible: playhead >= 0
        x: root.panel.xOf(playhead) - width / 2
        y: root.height - height
        width: Ui.Metrics.md
        height: Ui.Metrics.lg
        radius: Ui.Metrics.radiusControl
        color: TimelineVisuals.editBlue
    }
}

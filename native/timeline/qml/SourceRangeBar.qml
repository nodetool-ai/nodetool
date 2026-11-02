// The Source monitor's time ruler. The top half scrubs. The bottom half holds
// the marked range: drag a handle to trim it, drag the band to move it, click
// to scrub. A drag previews in SourceViewerState and writes the marks on
// release. Behaviour follows FilmCraft's source_range.rs (licenses/FilmCraft-MIT.txt).
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: bar
    property real durationMs: 0
    property real timeMs: 0
    property real inMs: 0
    property real outMs: 0
    property bool marksEnabled: true
    readonly property bool scrubbing: pointer.mode === "scrub" && pointer.pressed
    signal scrubbed(real timeMs)

    function xOf(ms) { return durationMs > 0 ? Math.max(0, Math.min(1, ms / durationMs)) * width : 0 }
    function timeAt(x) { return Math.max(0, Math.min(1, x / Math.max(1, width))) * Math.max(1, durationMs) }
    function cancelScrub() {
        if (!scrubbing) return
        pointer.mode = ""
        scrubbed(pointer.baselineMs)
    }

    implicitHeight: Ui.Metrics.standard
    Accessible.role: Accessible.Slider
    Accessible.name: "Source time"

    readonly property real bandTop: Math.round(height / 2)
    readonly property real handleReach: Ui.Metrics.sm

    Rectangle {
        anchors.fill: parent
        color: Ui.Theme.surfacePanel
        radius: Ui.Metrics.radiusControl
    }
    Rectangle {
        objectName: "sourceRangeBand"
        x: bar.xOf(bar.inMs)
        y: bar.bandTop
        width: Math.max(Ui.Metrics.border, bar.xOf(bar.outMs) - x)
        height: bar.height - bar.bandTop
        visible: bar.marksEnabled
        color: Ui.Theme.actionSelected
        border.width: Ui.Metrics.border
        border.color: Ui.Theme.borderStrong
    }
    Repeater {
        model: bar.marksEnabled ? ["in", "out"] : []
        delegate: Rectangle {
            required property string modelData
            objectName: modelData === "in" ? "sourceRangeIn" : "sourceRangeOut"
            x: bar.xOf(modelData === "in" ? bar.inMs : bar.outMs) - (modelData === "in" ? 0 : width)
            y: bar.bandTop
            width: Ui.Metrics.xs
            height: bar.height - bar.bandTop
            color: Ui.Theme.accentPrimary
        }
    }
    Rectangle {
        objectName: "sourcePlayhead"
        x: bar.xOf(bar.timeMs) - width / 2
        width: Ui.Metrics.micro
        height: bar.height
        color: Ui.Theme.textPrimary
    }

    MouseArea {
        id: pointer
        objectName: "sourceRangePointer"
        anchors.fill: parent
        property string mode: ""
        property real pressX: 0
        property real baselineMs: 0
        property bool moved: false
        cursorShape: containsMouse && bar.edgeAt(mouseX, mouseY) !== "" ? Qt.SizeHorCursor : Qt.ArrowCursor
        hoverEnabled: true
        preventStealing: true
        onPressed: mouse => {
            pressX = mouse.x
            moved = false
            baselineMs = bar.timeMs
            const edge = bar.edgeAt(mouse.x, mouse.y)
            mode = edge !== "" ? edge : mouse.y >= bar.bandTop && mouse.x > bar.xOf(bar.inMs) && mouse.x < bar.xOf(bar.outMs) && bar.marksEnabled ? "move" : "scrub"
            if (mode === "scrub") bar.scrubbed(bar.timeAt(mouse.x))
        }
        onPositionChanged: mouse => {
            if (!pressed || mode === "") return
            if (mode === "scrub") {
                bar.scrubbed(bar.timeAt(mouse.x))
                return
            }
            if (!moved && Math.abs(mouse.x - pressX) < Qt.styleHints.startDragDistance) return
            if (!moved) {
                moved = true
                SourceViewerState.beginRangeDrag(mode)
            }
            if (!SourceViewerState.rangeDragging) {
                mode = ""
                return
            }
            SourceViewerState.updateRangeDrag((mouse.x - pressX) / Math.max(1, bar.width) * bar.durationMs)
        }
        onReleased: mouse => {
            if (mode === "") return
            if (moved) {
                if (SourceViewerState.rangeDragging) SourceViewerState.commitRangeDrag()
            } else if (mode !== "scrub") {
                bar.scrubbed(bar.timeAt(pressX))
            }
            mode = ""
        }
        onCanceled: {
            SourceViewerState.cancelRangeDrag()
            bar.cancelScrub()
            mode = ""
        }
    }
    function edgeAt(x, y) {
        if (!marksEnabled || y < bandTop) return ""
        const fromIn = Math.abs(x - xOf(inMs))
        const fromOut = Math.abs(x - xOf(outMs))
        if (fromIn > handleReach && fromOut > handleReach) return ""
        return fromIn <= fromOut ? "in" : "out"
    }
}

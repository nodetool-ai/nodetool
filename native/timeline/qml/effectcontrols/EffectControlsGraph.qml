pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
// The value and velocity graphs of one row across the lane. Canvases draw the curves. The handles
// are items, with a stable count, so a drag survives the previews it makes. Graph layout follows
// FilmCraft crates/ui-egui/src/panels/effect_controls.rs graph_rows (licenses/FilmCraft-MIT.txt).
Column {
    id: root
    required property var panel
    required property string rowId
    required property var inputs
    property bool editable: true
    readonly property var controller: panel.controller
    readonly property var graph: {
        const revision = controller.revision
        return controller.rowGraph(rowId, panel.scrollMs, panel.scrollMs + panel.visibleMs, Math.max(8, Math.floor(panel.laneWidth / 3)))
    }
    readonly property var keyed: { const revision = controller.revision; return controller.rowGraphKeys(rowId) }
    // The range holds still during a handle drag, so the point under the pointer does not slide.
    property real heldLo: 0
    property real heldHi: 1
    readonly property real lo: panel.handleDragging ? heldLo : keyed.lo
    readonly property real hi: panel.handleDragging ? heldHi : keyed.hi
    function holdRange() {
        heldLo = keyed.lo
        heldHi = keyed.hi
    }
    readonly property var keyList: keyed.keys
    // Many keys in view draw handles only around a few selected ones, as Premiere draws them.
    readonly property int handleLimit: 24
    readonly property bool allHandles: {
        let inView = 0
        for (const key of keyList) {
            if (key.ms >= panel.scrollMs && key.ms <= panel.scrollMs + panel.visibleMs) ++inView
        }
        return inView <= handleLimit
    }
    function yOf(value) { return plot.height - (value - lo) / Math.max(1e-9, hi - lo) * plot.height }
    function valueAtY(y) { return lo + (plot.height - y) / Math.max(1, plot.height) * (hi - lo) }
    readonly property var curveColors: [Ui.Theme.accentPrimary, Ui.Theme.statusWarning]
    objectName: "effectControlsGraph_" + rowId
    onGraphChanged: { plot.requestPaint(); velocity.requestPaint() }
    onKeyedChanged: plot.requestPaint()
    onLoChanged: plot.requestPaint()
    onHiChanged: plot.requestPaint()
    Connections {
        target: root.panel
        function onSelectedKeysChanged() { if (!root.allHandles) plot.requestPaint() }
    }
    function showsHandles(a, b) {
        return allHandles || (panel.selectedCount <= handleLimit && (panel.isSelected(rowId, a.ms) || panel.isSelected(rowId, b.ms)))
    }
    Item {
        width: root.width
        height: Ui.Metrics.touch * 2.5
        Column {
            x: Ui.Metrics.xxxl + Ui.Metrics.md
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.micro
            Ui.Text {
                text: "Value"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            // Which curve is which, when the row has two.
            Repeater {
                model: root.inputs.length > 1 ? root.inputs : []
                delegate: Row {
                    required property var modelData
                    required property int index
                    spacing: Ui.Metrics.xs
                    Rectangle {
                        anchors.verticalCenter: parent.verticalCenter
                        width: Ui.Metrics.md
                        height: Ui.Metrics.micro
                        color: root.curveColors[parent.index % root.curveColors.length]
                    }
                    Ui.Text {
                        text: parent.modelData.label
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
            }
        }
        Ui.Text {
            objectName: "effectControlsGraphHi"
            x: root.panel.listWidth - width - Ui.Metrics.md
            y: Ui.Metrics.xs
            text: root.hi.toFixed(1)
            role: Ui.Typography.MonoCaption
            tone: Ui.Text.Secondary
        }
        Ui.Text {
            x: root.panel.listWidth - width - Ui.Metrics.md
            y: parent.height - height - Ui.Metrics.xs
            text: root.lo.toFixed(1)
            role: Ui.Typography.MonoCaption
            tone: Ui.Text.Secondary
        }
        Canvas {
            id: plot
            objectName: "effectControlsValuePlot_" + root.rowId
            x: root.panel.laneX
            width: root.panel.laneWidth
            height: parent.height - Ui.Metrics.xs
            clip: true
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                ctx.fillStyle = Ui.Theme.surfacePanel
                ctx.fillRect(0, 0, width, height)
                ctx.strokeStyle = Ui.Theme.borderSubtle
                ctx.lineWidth = Ui.Metrics.border
                ctx.beginPath()
                for (let g = 1; g < 4; ++g) {
                    ctx.moveTo(0, height * g / 4)
                    ctx.lineTo(width, height * g / 4)
                }
                ctx.stroke()
                const curves = root.graph.curves || []
                curves.forEach((curve, index) => {
                    ctx.strokeStyle = root.curveColors[index % root.curveColors.length]
                    ctx.lineWidth = 1.5
                    ctx.beginPath()
                    const count = curve.values.length - 1
                    curve.values.forEach((value, i) => {
                        const x = root.panel.xOf(root.panel.scrollMs + root.panel.visibleMs * i / Math.max(1, count))
                        if (i === 0) ctx.moveTo(x, root.yOf(value))
                        else ctx.lineTo(x, root.yOf(value))
                    })
                    ctx.stroke()
                })
                // The tangents from each key to its handles.
                ctx.strokeStyle = Ui.Theme.borderStrong
                ctx.lineWidth = Ui.Metrics.border
                ctx.beginPath()
                const keys = root.keyList || []
                for (let i = 1; i < keys.length; ++i) {
                    const handles = keys[i].handles
                    const a = keys[i - 1]
                    const b = keys[i]
                    if (!handles || !root.showsHandles(a, b)) continue
                    const input = root.handleInput(a, b)
                    const ax = root.panel.xOf(a.ms), bx = root.panel.xOf(b.ms)
                    const va = a.values[input], vb = b.values[input]
                    ctx.moveTo(ax, root.yOf(va))
                    ctx.lineTo(ax + handles.x1 * (bx - ax), root.yOf(va + handles.y1 * (vb - va)))
                    ctx.moveTo(bx, root.yOf(vb))
                    ctx.lineTo(ax + handles.x2 * (bx - ax), root.yOf(va + handles.y2 * (vb - va)))
                }
                ctx.stroke()
                // The keys. Squares in one path keep many of them cheap to draw.
                ctx.fillStyle = Ui.Theme.textPrimary
                ctx.beginPath()
                const mark = Ui.Metrics.xs + Ui.Metrics.micro
                for (const key of keys) {
                    const x = root.panel.xOf(key.ms)
                    if (x < -mark || x > width + mark) continue
                    for (const value of key.values) {
                        ctx.rect(x - mark / 2, root.yOf(value) - mark / 2, mark, mark)
                    }
                }
                ctx.fill()
            }
            Repeater {
                model: Math.max(0, (root.keyList || []).length - 1)
                delegate: Item {
                    id: seg
                    required property int index
                    readonly property var a: root.keyList[index] || null
                    readonly property var b: root.keyList[index + 1] || null
                    readonly property var handles: b && a && root.showsHandles(a, b) ? b.handles : null
                    readonly property int input: a && b ? root.handleInput(a, b) : 0
                    readonly property real ax: a ? root.panel.xOf(a.ms) : 0
                    readonly property real bx: b ? root.panel.xOf(b.ms) : 0
                    readonly property real va: a ? a.values[input] : 0
                    readonly property real vb: b ? b.values[input] : 0
                    function place(fx, fy) { return Qt.point(ax + fx * (bx - ax), root.yOf(va + fy * (vb - va))) }
                    function drag(side, x, y) {
                        const span = bx - ax
                        const fx = span > 0 ? Math.max(0, Math.min(1, (x - ax) / span)) : 0
                        const flat = Math.abs(vb - va) < 1e-6
                        const fy = flat ? (side === "out" ? handles.y1 : handles.y2) : Math.max(-2, Math.min(3, (root.valueAtY(y) - va) / (vb - va)))
                        const next = side === "out" ? [fx, fy, handles.x2, handles.y2] : [handles.x1, handles.y1, fx, fy]
                        return {action: "easing", row: root.rowId, atMs: b.ms, easing: root.controller.bezierEasing(next[0], next[1], next[2], next[3])}
                    }
                    EffectControlsHandle {
                        objectName: "effectControlsHandle_" + root.rowId + "_" + seg.index + "_out"
                        segment: seg
                        graph: root
                        plotItem: plot
                        side: "out"
                    }
                    EffectControlsHandle {
                        objectName: "effectControlsHandle_" + root.rowId + "_" + seg.index + "_in"
                        segment: seg
                        graph: root
                        plotItem: plot
                        side: "in"
                    }
                }
            }
        }
    }
    function handleInput(a, b) {
        let best = 0
        let bestSpan = -1
        for (let i = 0; i < a.values.length; ++i) {
            const span = Math.abs(b.values[i] - a.values[i])
            if (span > bestSpan) { best = i; bestSpan = span }
        }
        return best
    }
    Item {
        width: root.width
        height: Ui.Metrics.touch * 1.5
        Ui.Text {
            x: Ui.Metrics.xxxl + Ui.Metrics.md
            anchors.verticalCenter: parent.verticalCenter
            text: "Velocity"
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        Ui.Text {
            objectName: "effectControlsGraphVmax"
            x: root.panel.listWidth - width - Ui.Metrics.md
            y: Ui.Metrics.xs
            text: (root.graph.vmax || 0).toFixed(1) + "/s"
            role: Ui.Typography.MonoCaption
            tone: Ui.Text.Secondary
        }
        Canvas {
            id: velocity
            objectName: "effectControlsVelocityPlot_" + root.rowId
            x: root.panel.laneX
            width: root.panel.laneWidth
            height: parent.height - Ui.Metrics.xs
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                ctx.fillStyle = Ui.Theme.surfacePanel
                ctx.fillRect(0, 0, width, height)
                ctx.strokeStyle = Ui.Theme.borderControl
                ctx.lineWidth = Ui.Metrics.border
                ctx.beginPath()
                ctx.moveTo(0, height / 2)
                ctx.lineTo(width, height / 2)
                ctx.stroke()
                const samples = root.graph.velocity || []
                const peak = Math.max(1e-6, (root.graph.vmax || 0) * 1.15)
                ctx.strokeStyle = Ui.Theme.statusWarning
                ctx.lineWidth = 1.2
                ctx.beginPath()
                samples.forEach((value, i) => {
                    const x = root.panel.xOf(root.panel.scrollMs + root.panel.visibleMs * (i + 0.5) / Math.max(1, samples.length))
                    const y = height / 2 - value / peak * height / 2
                    if (i === 0) ctx.moveTo(x, y)
                    else ctx.lineTo(x, y)
                })
                ctx.stroke()
            }
        }
    }
    Ui.Separator { width: root.width }
}

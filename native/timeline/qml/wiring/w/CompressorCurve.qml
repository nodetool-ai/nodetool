import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "CurveMath.js" as MathFx
Rectangle {
    id: graph
    objectName: "compressor-curve-" + effect.id
    required property var effect
    property bool disabled: false
    signal preview(var patch)
    signal commit(var patch)
    signal editCanceled()
    implicitWidth: 180; implicitHeight: 180
    width: implicitWidth; height: implicitHeight
    color: Ui.Theme.surfacePanel
    border.width: Ui.Metrics.border; border.color: Ui.Theme.borderSubtle; radius: Ui.Metrics.xs
    function position(db) { return (db + 60) / 60 * width }
    function output(db) { return MathFx.compTransferDb(db,effect.thresholdDb,effect.ratio,effect.kneeDb) }
    Connections { target: Ui.Theme; function onEffectiveSchemeChanged() { curve.requestPaint() } }
    onEffectChanged: curve.requestPaint()
    onDisabledChanged: curve.requestPaint()
    Canvas {
        id: curve
        anchors.fill: parent
        onPaint: {
            const ctx = getContext("2d")
            ctx.reset()
            ctx.strokeStyle = Ui.Theme.borderSubtle; ctx.lineWidth = 0.5; ctx.setLineDash([2,3])
            for (const db of [-48,-36,-24,-12]) {
                const p = graph.position(db)
                ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,height); ctx.moveTo(0,height-p); ctx.lineTo(width,height-p); ctx.stroke()
            }
            ctx.beginPath(); ctx.moveTo(0,height); ctx.lineTo(width,0); ctx.strokeStyle = Ui.Theme.textDisabled; ctx.stroke()
            ctx.setLineDash([]); ctx.beginPath()
            for (let i=0;i<=80;++i) {
                const y = height - graph.position(graph.output(-60 + i / 80 * 60))
                if (i === 0) ctx.moveTo(0,y)
                else ctx.lineTo(i / 80 * width,y)
            }
            ctx.strokeStyle = graph.disabled ? Ui.Theme.textDisabled : Ui.Theme.statusWarning; ctx.lineWidth = 1.75; ctx.stroke()
            ctx.lineTo(width,height); ctx.lineTo(0,height); ctx.closePath()
            ctx.globalAlpha = graph.disabled ? 0.06 : 0.14; ctx.fillStyle = Ui.Theme.statusWarning; ctx.fill(); ctx.globalAlpha = 0.6
            ctx.setLineDash([2,4]); ctx.strokeStyle = TimelineVisuals.chord; ctx.lineWidth = 0.75
            const x = graph.position(graph.effect.thresholdDb)
            ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,height); ctx.stroke()
        }
    }
    Repeater {
        model: [-48,-36,-24,-12]
        delegate: Ui.Text { required property int modelData; x: graph.position(modelData) + Ui.Metrics.micro; y: graph.height - height; text: String(modelData); role: Ui.Typography.MonoCaption; tone: Ui.Text.Disabled }
    }
    Repeater {
        model: ["threshold", "ratio"]
        delegate: Rectangle {
            id: handle
            objectName: "fx-handle-" + graph.effect.id + "-" + modelData
            required property string modelData
            width: 22; height: 22; radius: width / 2
            readonly property bool threshold: modelData === "threshold"
            readonly property real input: threshold ? graph.effect.thresholdDb : -3
            x: graph.position(input) - width / 2
            y: graph.height - graph.position(graph.output(input)) - height / 2
            color: Ui.Theme.surfacePanel
            border.width: activeFocus ? Ui.Metrics.focus : Ui.Metrics.border; border.color: threshold ? TimelineVisuals.chord : Ui.Theme.statusWarning
            enabled: !graph.disabled
            activeFocusOnTab: true
            Accessible.role: Accessible.Slider
            Accessible.name: threshold ? "Threshold" : "Ratio"
            Ui.Text { anchors.centerIn: parent; text: handle.threshold ? "T" : "R"; domainColor: handle.border.color; role: Ui.Typography.MonoCaption }
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Escape) { event.accepted = true; graph.editCanceled(); return }
                const dir = event.key === Qt.Key_Right || event.key === Qt.Key_Up ? 1 : event.key === Qt.Key_Left || event.key === Qt.Key_Down ? -1 : 0
                if (!dir) return
                event.accepted = true
                graph.preview(handle.threshold ? {thresholdDb: Math.max(-60,Math.min(0,graph.effect.thresholdDb + dir))}
                    : {ratio: Math.max(1,Math.min(20,graph.effect.ratio + dir * 0.1))})
            }
            Keys.onReleased: event => {
                if (!event.isAutoRepeat && (event.key === Qt.Key_Up || event.key === Qt.Key_Down || event.key === Qt.Key_Left || event.key === Qt.Key_Right)) {
                    event.accepted = true
                    graph.commit({})
                }
            }
            MouseArea {
                anchors.fill: parent; preventStealing: true; cursorShape: Qt.SizeAllCursor
                onPressed: handle.forceActiveFocus()
                onPositionChanged: event => {
                    if (!pressed) return
                    const p = mapToItem(graph,event.x,event.y)
                    if (handle.threshold) graph.preview({thresholdDb: Number(Math.max(-60,Math.min(0,-60 + p.x / graph.width * 60)).toFixed(1))})
                    else {
                        const py = Math.max(0,Math.min(graph.height,p.y))
                        const delta = -3 - graph.effect.thresholdDb
                        const compressedDelta = -60 + (graph.height - py) / graph.height * 60 - graph.effect.thresholdDb
                        const ratio = delta <= 0 ? 1 + (graph.height - py) / graph.height * 19 : compressedDelta <= 0.01 ? 20 : delta / compressedDelta
                        graph.preview({ratio: Number(Math.max(1,Math.min(20,ratio)).toFixed(2))})
                    }
                }
                onReleased: graph.commit({})
                onCanceled: graph.editCanceled()
            }
            Timer { id: wheelEnd; interval: 250; onTriggered: graph.commit({}) }
            WheelHandler {
                enabled: handle.threshold && !graph.disabled
                onWheel: event => {
                    graph.preview({kneeDb: Math.max(0,Math.min(40,graph.effect.kneeDb + (event.angleDelta.y > 0 ? 1 : -1)))})
                    event.accepted = true; wheelEnd.restart()
                }
            }
        }
    }
}

import QtQuick
import NodeTool.Timeline
import "CurveMath.js" as MathFx
Rectangle {
    id: graph
    objectName: "compressor-curve-" + effect.id
    required property var effect
    property bool disabled: false
    signal preview(var patch)
    signal commit(var patch)
    implicitWidth: 180; implicitHeight: 180
    width: implicitWidth; height: implicitHeight
    color: Theme.backgroundPaper
    border.width: 1; border.color: Theme.divider; radius: Theme.radiusSm
    function position(db) { return (db + 60) / 60 * width }
    function output(db) { return MathFx.compTransferDb(db,effect.thresholdDb,effect.ratio,effect.kneeDb) }
    onEffectChanged: curve.requestPaint()
    onDisabledChanged: curve.requestPaint()
    Canvas {
        id: curve
        anchors.fill: parent
        onPaint: {
            const ctx = getContext("2d")
            ctx.reset(); ctx.font = "9px monospace"; ctx.fillStyle = Theme.textDisabled
            ctx.strokeStyle = Theme.divider; ctx.lineWidth = 0.5; ctx.setLineDash([2,3])
            for (const db of [-48,-36,-24,-12]) {
                const p = graph.position(db)
                ctx.beginPath(); ctx.moveTo(p,0); ctx.lineTo(p,height); ctx.moveTo(0,height-p); ctx.lineTo(width,height-p); ctx.stroke()
                ctx.fillText(String(db),p+2,height-4)
            }
            ctx.beginPath(); ctx.moveTo(0,height); ctx.lineTo(width,0); ctx.strokeStyle = Theme.textDisabled; ctx.stroke()
            ctx.setLineDash([]); ctx.beginPath()
            for (let i=0;i<=80;++i) {
                const y = height - graph.position(graph.output(-60 + i / 80 * 60))
                if (i === 0) ctx.moveTo(0,y)
                else ctx.lineTo(i / 80 * width,y)
            }
            ctx.strokeStyle = graph.disabled ? Theme.textDisabled : Theme.warning; ctx.lineWidth = 1.75; ctx.stroke()
            ctx.lineTo(width,height); ctx.lineTo(0,height); ctx.closePath()
            ctx.globalAlpha = graph.disabled ? 0.06 : 0.14; ctx.fillStyle = Theme.warning; ctx.fill(); ctx.globalAlpha = 0.6
            ctx.setLineDash([2,4]); ctx.strokeStyle = Theme.warningLight; ctx.lineWidth = 0.75
            const x = graph.position(graph.effect.thresholdDb)
            ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,height); ctx.stroke()
        }
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
            color: Theme.backgroundPaper
            border.width: activeFocus ? 3 : 2; border.color: threshold ? Theme.warningLight : Theme.warning
            enabled: !graph.disabled
            activeFocusOnTab: true
            Accessible.role: Accessible.Slider
            Accessible.name: threshold ? "Threshold" : "Ratio"
            Text { anchors.centerIn: parent; text: handle.threshold ? "T" : "R"; color: handle.border.color; font.pixelSize: 9; font.family: Theme.monoFamily }
            Keys.onPressed: event => {
                const dir = event.key === Qt.Key_Right || event.key === Qt.Key_Up ? 1 : event.key === Qt.Key_Left || event.key === Qt.Key_Down ? -1 : 0
                if (!dir) return
                event.accepted = true
                graph.preview(handle.threshold ? {thresholdDb: Math.max(-60,Math.min(0,graph.effect.thresholdDb + dir))}
                    : {ratio: Math.max(1,Math.min(20,graph.effect.ratio + dir * 0.1))})
            }
            Keys.onReleased: graph.commit({})
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
                onCanceled: graph.commit({})
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

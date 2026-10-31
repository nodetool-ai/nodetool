import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "CurveMath.js" as MathFx

Rectangle {
    id: graph
    objectName: "eq3-curve-" + effect.id
    required property var effect
    property bool disabled: false
    signal preview(var patch)
    signal commit(var patch)
    signal editCanceled()
    readonly property var ranges: [[40,400], [100,8000], [2000,16000]]
    readonly property var bands: ["low", "mid", "high"]
    readonly property var colors: [Ui.Theme.statusInfo, Ui.Theme.statusSuccess, Ui.Theme.statusWarning]
    implicitHeight: 160
    height: implicitHeight
    radius: Ui.Metrics.xs
    border.width: Ui.Metrics.border
    border.color: Ui.Theme.borderSubtle
    color: Ui.Theme.surfaceInput
    function frequencyX(f) { return Math.log(f / 20) / Math.log(1000) * width }
    function gainY(db) { return height / 2 - db / 18 * height / 2 }
    Connections { target: Ui.Theme; function onEffectiveSchemeChanged() { curve.requestPaint() } }
    onEffectChanged: curve.requestPaint()
    onDisabledChanged: curve.requestPaint()
    Canvas {
        id: curve
        anchors.fill: parent
        onPaint: {
            const ctx = getContext("2d")
            ctx.reset()
            const e = graph.effect
            ctx.strokeStyle = Ui.Theme.borderSubtle
            ctx.lineWidth = 0.5
            for (const f of [50,100,200,500,1000,2000,5000,10000]) {
                const x = graph.frequencyX(f)
                ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,height); ctx.stroke()
            }
            for (const db of [-12,-6,0,6,12]) {
                const y = graph.gainY(db)
                ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(width,y); ctx.stroke()
            }
            ctx.beginPath()
            for (let i = 0; i <= 256; ++i) {
                const f = 20 * Math.pow(1000,i / 256)
                const db = MathFx.biquadMagDb("lowshelf",f,e.lowFreq,e.lowGainDb,0.7)
                    + MathFx.biquadMagDb("peaking",f,e.midFreq,e.midGainDb,e.midQ)
                    + MathFx.biquadMagDb("highshelf",f,e.highFreq,e.highGainDb,0.7)
                const y = graph.gainY(Math.max(-18,Math.min(18,db)))
                if (i === 0) ctx.moveTo(0,y)
                else ctx.lineTo(i / 256 * width,y)
            }
            ctx.strokeStyle = graph.disabled ? Ui.Theme.textDisabled : Ui.Theme.accentPrimary
            ctx.lineWidth = 1.75
            ctx.stroke()
            ctx.lineTo(width,height / 2); ctx.lineTo(0,height / 2); ctx.closePath()
            ctx.globalAlpha = graph.disabled ? 0.06 : 0.14
            ctx.fillStyle = Ui.Theme.accentPrimary; ctx.fill()
        }
    }
    Repeater {
        model: [50,100,200,500,1000,2000,5000,10000]
        delegate: Ui.Text { required property int modelData; x: graph.frequencyX(modelData) + Ui.Metrics.micro; y: graph.height - height; text: modelData >= 1000 ? modelData / 1000 + "k" : String(modelData); role: Ui.Typography.MonoCaption; tone: Ui.Text.Disabled }
    }
    Repeater {
        model: [-12,-6,0,6,12]
        delegate: Ui.Text { required property int modelData; x: Ui.Metrics.xs; y: graph.gainY(modelData) - height; text: (modelData > 0 ? "+" : "") + modelData; role: Ui.Typography.MonoCaption; tone: Ui.Text.Disabled }
    }
    Repeater {
        model: graph.bands
        delegate: Rectangle {
            id: handle
            objectName: "fx-handle-" + graph.effect.id + "-" + modelData
            required property string modelData
            required property int index
            width: 22; height: 22; radius: width / 2
            x: graph.frequencyX(graph.effect[modelData + "Freq"]) - width / 2
            y: graph.gainY(graph.effect[modelData + "GainDb"]) - height / 2
            color: Ui.Theme.surfacePanel
            border.width: activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
            border.color: graph.disabled ? Ui.Theme.textDisabled : graph.colors[index]
            enabled: !graph.disabled
            activeFocusOnTab: true
            Accessible.role: Accessible.Slider
            Accessible.name: TrackEffectsReference.data.strings.eq.band.replace("{{band}}", TrackEffectsReference.data.strings.eq.bands[modelData])
            Accessible.description: graph.effect[modelData + "Freq"].toFixed(0) + " Hz, " + graph.effect[modelData + "GainDb"].toFixed(1) + " dB"
            Ui.Text { anchors.centerIn: parent; text: handle.modelData[0].toUpperCase(); domainColor: handle.border.color; role: Ui.Typography.MonoCaption }
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Escape) { event.accepted = true; graph.editCanceled(); return }
                const dir = event.key === Qt.Key_Right || event.key === Qt.Key_Up ? 1 : event.key === Qt.Key_Left || event.key === Qt.Key_Down ? -1 : 0
                if (!dir) return
                event.accepted = true
                const patch = {}
                const vertical = event.key === Qt.Key_Up || event.key === Qt.Key_Down
                if (vertical && event.modifiers & Qt.AltModifier) {
                    if (modelData !== "mid") return
                    patch.midQ = Math.max(0.1,Math.min(10,graph.effect.midQ * (dir < 0 ? 0.9 : 1.1)))
                } else if (vertical) patch[modelData + "GainDb"] = Math.max(-18,Math.min(18,graph.effect[modelData + "GainDb"] + dir * (event.modifiers & Qt.ShiftModifier ? 2 : 0.5)))
                else {
                    const factor = event.modifiers & Qt.ShiftModifier ? 1.2 : 1.05
                    patch[modelData + "Freq"] = Math.max(graph.ranges[index][0],Math.min(graph.ranges[index][1],graph.effect[modelData + "Freq"] * (dir > 0 ? factor : 1 / factor)))
                }
                graph.preview(patch)
            }
            Keys.onReleased: event => {
                if (!event.isAutoRepeat && (event.key === Qt.Key_Up || event.key === Qt.Key_Down || event.key === Qt.Key_Left || event.key === Qt.Key_Right)) {
                    event.accepted = true
                    graph.commit({})
                }
            }
            MouseArea {
                anchors.fill: parent
                preventStealing: true
                cursorShape: Qt.SizeAllCursor
                onPressed: handle.forceActiveFocus()
                onPositionChanged: event => {
                    if (!pressed) return
                    const point = mapToItem(graph,event.x,event.y)
                    const patch = {}
                    patch[handle.modelData + "Freq"] = Math.max(graph.ranges[handle.index][0],Math.min(graph.ranges[handle.index][1],20 * Math.pow(1000,Math.max(0,Math.min(graph.width,point.x)) / graph.width)))
                    patch[handle.modelData + "GainDb"] = Math.max(-18,Math.min(18,(graph.height / 2 - point.y) / (graph.height / 2) * 18))
                    graph.preview(patch)
                }
                onReleased: graph.commit({})
                onCanceled: graph.editCanceled()
            }
            Timer { id: wheelEnd; interval: 250; onTriggered: graph.commit({}) }
            WheelHandler {
                enabled: handle.modelData === "mid" && !graph.disabled
                onWheel: event => {
                    const next = Math.max(0.1,Math.min(10,graph.effect.midQ * (event.angleDelta.y < 0 ? 0.9 : 1.1)))
                    graph.preview({midQ: Number(next.toFixed(2))})
                    wheelEnd.restart(); event.accepted = true
                }
            }
        }
    }
}

import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../../fx"
import "../../fx/FxParams.js" as Params
import "CurveMath.js" as MathFx

// The device view of one `fable` effect: knob sections left to right as in the
// FableSynth panels. Every edit is a `params` patch with the whole parameter
// map, so a parameter keeps its automation id (`fx.<unit>.<param>`).
EffectEditor {
    id: editor
    objectName: "fable-editor-" + (effect.id ?? "")
    readonly property string kind: effect.kind ?? ""
    readonly property var layout: Params.FABLE_FX_LAYOUT[kind] ?? ({sections: []})
    readonly property var params: effect.params ?? ({})
    readonly property real cell: 60
    spacing: Ui.Metrics.sm

    function def(id) { return Params.fableParamDef(kind, id) }
    function value(id) {
        const v = params[id]
        if (v !== undefined) return Number(v)
        const d = def(id)
        return d ? d.def : 0
    }
    function withParams(changes) { return {params: Object.assign({}, params, changes)} }
    function one(id, v) { const c = {}; c[id] = v; return withParams(c) }
    function active(section, id) {
        const rule = (section.active ?? {})[id]
        if (!rule) return true
        return rule[0] === "!" ? value(rule.slice(1)) < 0.5 : value(rule) >= 0.5
    }
    function previewParam(id, v) { preview(one(id, v)) }
    function commitParam(id, v) { commit(one(id, v)) }

    // The EQ curve edits LOW, MID 1 and HIGH through the three-band view.
    readonly property var eqKeys: ({lowFreq: "fx.eq.lfreq", lowGainDb: "fx.eq.low", midFreq: "fx.eq.mfreq", midGainDb: "fx.eq.mid",
                                    midQ: "fx.eq.mq", highFreq: "fx.eq.hfreq", highGainDb: "fx.eq.high"})
    readonly property var compKeys: ({thresholdDb: "fx.comp.thr", ratio: "fx.comp.ratio"})
    function curvePatch(keys, patch, clamp) {
        const changes = {}
        for (const key in patch) {
            const id = keys[key]
            if (!id) continue
            const d = def(id)
            changes[id] = Math.max(d.min, Math.min(d.max, patch[key]))
        }
        return Object.keys(changes).length ? withParams(changes) : ({})
    }
    function eqResponse(f) {
        const types = ["lowshelf", "peaking", "highshelf"]
        const bands = [["fx.eq.lon", "fx.eq.ltype", "fx.eq.lfreq", "fx.eq.low", "fx.eq.lq"],
                       ["fx.eq.mon", "fx.eq.mtype", "fx.eq.mfreq", "fx.eq.mid", "fx.eq.mq"],
                       ["fx.eq.m2on", "fx.eq.m2type", "fx.eq.m2freq", "fx.eq.mid2", "fx.eq.m2q"],
                       ["fx.eq.hon", "fx.eq.htype", "fx.eq.hfreq", "fx.eq.high", "fx.eq.hq"]]
        let db = 0
        for (const b of bands) {
            if (value(b[0]) < 0.5) continue
            db += MathFx.biquadMagDb(types[Math.round(value(b[1]))] ?? "peaking", f, value(b[2]), value(b[3]), value(b[4]))
        }
        return db
    }

    Row {
        id: device
        // The tallest section sets the height of every section and curve.
        property real tallest: 0
        function measure() {
            let most = 0
            for (let i = 0; i < sectionRepeater.count; ++i) {
                const section = sectionRepeater.itemAt(i)
                if (section) most = Math.max(most, section.bodyHeight + 2 * Ui.Metrics.sm)
            }
            tallest = most
        }
        spacing: Ui.Metrics.sm
        Loader {
            active: editor.layout.curve === "eq"
            visible: active
            sourceComponent: Eq3Curve {
                width: 200; implicitHeight: device.tallest
                effect: ({id: editor.effect.id, lowFreq: editor.value("fx.eq.lfreq"), lowGainDb: editor.value("fx.eq.low"),
                          midFreq: editor.value("fx.eq.mfreq"), midGainDb: editor.value("fx.eq.mid"), midQ: editor.value("fx.eq.mq"),
                          highFreq: editor.value("fx.eq.hfreq"), highGainDb: editor.value("fx.eq.high")})
                response: f => editor.eqResponse(f)
                disabled: editor.disabled
                onPreview: patch => { const p = editor.curvePatch(editor.eqKeys, patch); if (p.params) editor.preview(p) }
                onCommit: patch => editor.commit(editor.curvePatch(editor.eqKeys, patch))
                onEditCanceled: editor.editCanceled()
            }
        }
        Loader {
            active: editor.layout.curve === "comp"
            visible: active
            sourceComponent: CompressorCurve {
                implicitWidth: device.tallest; implicitHeight: device.tallest
                effect: ({id: editor.effect.id, thresholdDb: editor.value("fx.comp.thr"), ratio: editor.value("fx.comp.ratio"), kneeDb: 0})
                disabled: editor.disabled
                onPreview: patch => { const p = editor.curvePatch(editor.compKeys, patch); if (p.params) editor.preview(p) }
                onCommit: patch => editor.commit(editor.curvePatch(editor.compKeys, patch))
                onEditCanceled: editor.editCanceled()
            }
        }
        Repeater {
            id: sectionRepeater
            model: editor.layout.sections
            delegate: Rectangle {
                id: section
                required property var modelData
                required property int index
                readonly property real bodyHeight: body.implicitHeight
                readonly property bool on: !modelData.power || editor.value(modelData.power) >= 0.5
                width: Math.max(modelData.knobs.length, 2) * editor.cell + 2 * Ui.Metrics.sm
                height: device.tallest
                radius: Ui.Metrics.xs
                color: Ui.Theme.surfacePanel
                border.width: Ui.Metrics.border; border.color: Ui.Theme.borderSubtle
                Column {
                    id: body
                    x: Ui.Metrics.sm; y: Ui.Metrics.sm
                    width: parent.width - 2 * Ui.Metrics.sm
                    spacing: Ui.Metrics.xs
                    onImplicitHeightChanged: device.measure()
                    Component.onCompleted: device.measure()
                    Item {
                        width: parent.width; height: Math.max(title.implicitHeight, power.visible ? power.implicitHeight : 0)
                        Ui.Text {
                            id: title
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width - (power.visible ? power.width + Ui.Metrics.xs : 0)
                            elide: Text.ElideRight
                            text: section.modelData.title
                            role: Ui.Typography.SansCaption
                            tone: section.on && !editor.disabled ? Ui.Text.Primary : Ui.Text.Disabled
                        }
                        Ui.Toggle {
                            id: power
                            readonly property string param: section.modelData.power ?? section.modelData.toggle ?? ""
                            readonly property var paramDef: param ? editor.def(param) : null
                            objectName: visible ? "fable-toggle-" + editor.effect.id + "-" + param : ""
                            visible: param !== ""
                            anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
                            enabled: !editor.disabled
                            text: section.modelData.power ? "" : (paramDef?.label ?? "")
                            accessibleName: section.modelData.power ? section.modelData.title + " on" : text
                            checked: param !== "" && editor.value(param) >= 0.5
                            onCheckedChangedByUser: checked => editor.commitParam(param, checked ? 1 : 0)
                        }
                    }
                    Row {
                      id: controlRow
                      visible: (section.modelData.controls ?? []).length > 0
                      spacing: Ui.Metrics.xs
                      Repeater {
                        model: section.modelData.controls ?? []
                        delegate: Loader {
                            id: control
                            required property string modelData
                            readonly property var paramDef: editor.def(modelData)
                            readonly property int count: section.modelData.controls.length
                            width: (body.width - (count - 1) * Ui.Metrics.xs) / count
                            enabled: section.on && !editor.disabled && editor.active(section.modelData, modelData)
                            sourceComponent: paramDef.type === "bool" ? switchRow
                                : paramDef.options.join("").length * 8 + paramDef.options.length * Ui.Metrics.md <= width ? segmentRow : selectRow
                            Component {
                                id: segmentRow
                                Ui.SegmentedControl {
                                    objectName: "fable-enum-" + editor.effect.id + "-" + control.modelData
                                    variant: Ui.SegmentedControl.Tray
                                    accessibleName: control.paramDef.label
                                    optionNamePrefix: objectName + "-"
                                    options: control.paramDef.options.map((label, i) => ({label: label, value: i}))
                                    value: Math.round(editor.value(control.modelData))
                                    onValueCommitted: v => editor.commitParam(control.modelData, v)
                                }
                            }
                            Component {
                                id: selectRow
                                Ui.Select {
                                    objectName: "fable-enum-" + editor.effect.id + "-" + control.modelData
                                    density: Ui.EditorButton.Compact
                                    accessibleName: control.paramDef.label
                                    options: control.paramDef.options.map((label, i) => ({label: label, value: i}))
                                    value: Math.round(editor.value(control.modelData))
                                    onValueCommitted: v => editor.commitParam(control.modelData, v)
                                }
                            }
                            Component {
                                id: switchRow
                                Ui.Toggle {
                                    objectName: "fable-toggle-" + editor.effect.id + "-" + control.modelData
                                    text: control.paramDef.label
                                    accessibleName: control.paramDef.label
                                    checked: editor.value(control.modelData) >= 0.5
                                    onCheckedChangedByUser: checked => editor.commitParam(control.modelData, checked ? 1 : 0)
                                }
                            }
                        }
                    }
                    }
                Row {
                    Repeater {
                        model: section.modelData.knobs
                        delegate: Item {
                            id: knobCell
                            required property string modelData
                            width: editor.cell; height: knob.implicitHeight
                            FxKnob {
                                id: knob
                                objectName: "fable-knob-" + editor.effect.id + "-" + knobCell.modelData
                                anchors.horizontalCenter: parent.horizontalCenter
                                enabled: section.on && !editor.disabled && editor.active(section.modelData, knobCell.modelData)
                                opacity: enabled ? 1 : 0.5
                                accent: section.index % 2 ? "a" : "n"
                                def: editor.def(knobCell.modelData)
                                value: editor.value(knobCell.modelData)
                                onDraggingChanged: TrackEffectsState.parameterGesture = dragging
                                Component.onDestruction: if (dragging) TrackEffectsState.parameterGesture = false
                                onChange: v => editor.previewParam(knobCell.modelData, v)
                                onGestureEnd: editor.commit({})
                                onGestureCanceled: editor.editCanceled()
                                onSetValue: v => editor.commitParam(knobCell.modelData, v)
                            }
                        }
                    }
                }
            }
        }
        }
    }
}

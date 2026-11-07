pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Column {
    id: root
    required property ClipInspectorController controller
    property var custom: ({curves:[]})
    property bool sourceAnchored: false
    readonly property bool baked: custom.code !== undefined
    readonly property var properties: ["offsetX","offsetY","scale","scaleX","scaleY","rotation","rotationX","rotationY","opacity","wipeProgress","blur","brightness","saturation","contrast","hue","temperature","tint","positionX","positionY","anchorX","anchorY","trimStart","trimEnd","cameraAzimuth","cameraElevation","cameraZoom","cameraFov"]
    function curveError(input) {
        const data = JSON.parse(JSON.stringify(input === undefined ? custom : input))
        const curves = data.curves ?? []
        if (curves.length === 0) return ""
        const base = data.timeBase
        if (base !== undefined && base !== null && base !== "clip" && base !== "source")
            return "timeBase is " + JSON.stringify(base) + "; expected clip or source"
        if (!Array.isArray(curves)) return "curves must be an array"
        if (curves.length > 16) return curves.length + " curves; the limit is 16"
        const seen = new Set()
        for (let i = 0; i < curves.length; ++i) {
            const curve = curves[i]
            if (!curve || typeof curve !== "object" || Array.isArray(curve)) return "curves[" + i + "] is not an object"
            const property = curve.property
            if (typeof property !== "string" || !properties.includes(property))
                return "curves[" + i + "].property is " + JSON.stringify(property) + "; expected one of " + properties.join(", ")
            const keys = curve.keyframes
            const prefix = "curves[" + i + "] (" + property + ")"
            if (!Array.isArray(keys) || keys.length === 0) return prefix + " has no keyframes"
            if (keys.length > 4096) return prefix + " has " + keys.length + " keyframes; the limit is 4096"
            for (let k = 0; k < keys.length; ++k) {
                const key = keys[k]
                if (!key || typeof key !== "object" || Array.isArray(key) ||
                    (base !== "source" && (typeof key.t !== "number" || !Number.isFinite(key.t))) ||
                    typeof key.value !== "number" || !Number.isFinite(key.value))
                    return prefix + " keyframe " + k + " needs finite numeric " + (base === "source" ? "`sourceMs`" : "`t`") + " and `value`"
            }
            if (base === "source") {
                for (let k = 0; k < keys.length; ++k) {
                    const ms = keys[k].sourceMs
                    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0)
                        return prefix + " keyframe " + k + " needs a finite non-negative `sourceMs` — a source-anchored curve is placed by it"
                    if (k > 0 && ms < keys[k-1].sourceMs)
                        return prefix + " keyframe " + k + " goes back in the source (" + ms + "ms after " + keys[k-1].sourceMs + "ms) — keyframes must ascend"
                }
            }
            if (seen.has(property)) return "two curves drive \"" + property + "\" — one curve per property"
            seen.add(property)
        }
        return ""
    }
    readonly property string validationError: curveError()
    signal change(var custom)
    spacing: Ui.Metrics.md
    function setCurves(curves) { change(Object.assign({},custom,{curves:curves})) }
    function patchCurve(index,patch) { setCurves(custom.curves.map((c,i) => i === index ? Object.assign({},c,patch) : c)) }
    function patchKeyframe(curveIndex,index,patch) {
        patchCurve(curveIndex,{keyframes:custom.curves[curveIndex].keyframes.map((k,i) => i === index ? Object.assign({},k,patch) : k)})
    }
    Ui.Text { width: parent.width; visible: root.baked; text: "Baked from JavaScript"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
    Ui.Text { width: parent.width; visible: root.sourceAnchored; text: "Times follow the source clock. Keyframe positions are read-only here."; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary; wrapMode: Text.WordWrap }
    Repeater {
        model: root.baked ? [] : root.custom.curves
        Column {
            id: curveEditor
            required property var modelData
            required property int index
            width: parent.width
            spacing: Ui.Metrics.xs
            Row {
                spacing: Ui.Metrics.md
                Ui.Text { text: "Curve " + (curveEditor.index+1); role: Ui.Typography.SansLabel }
                KeyframeButton { text: "×"; label: "Delete curve " + (curveEditor.index+1); enabled: !root.controller.locked; onClicked: root.setCurves(root.custom.curves.filter((c,i) => i !== curveEditor.index)) }
            }
            InspectorRow {
                width: parent.width
                label: "Property"
                InspectorSelect { label: "Curve property"; value: curveEditor.modelData.property; options: root.properties.map(p => ({value:p,label:p})); disabled: root.controller.locked; onChange: next => root.patchCurve(curveEditor.index,{property:next}) }
            }
            Repeater {
                model: curveEditor.modelData.keyframes
                Row {
                    id: keyframeRow
                    required property var modelData
                    required property int index
                    spacing: Ui.Metrics.micro
                    InspectorPillInput {
                        minWidth: Ui.Metrics.small * 2 + Ui.Metrics.xs
                        value: root.sourceAnchored ? String(keyframeRow.modelData.sourceMs || 0)+"ms" : keyframeRow.modelData.t.toFixed(2)
                        disabled: root.controller.locked || root.sourceAnchored
                        ariaLabel: "Keyframe time"
                        scrub: ({step:0.01,min:0,max:1})
                        onCommit: raw => { const n = Number(raw); if (Number.isFinite(n)) root.patchKeyframe(curveEditor.index,keyframeRow.index,{t:Math.max(0,Math.min(1,n))}) }
                    }
                    InspectorPillInput {
                        minWidth: Ui.Metrics.standard * 2
                        value: String(keyframeRow.modelData.value)
                        disabled: root.controller.locked
                        ariaLabel: "Keyframe value"
                        onCommit: raw => { const n = Number(raw); if (Number.isFinite(n)) root.patchKeyframe(curveEditor.index,keyframeRow.index,{value:n}) }
                    }
                    InspectorPillInput {
                        minWidth: Ui.Metrics.standard * 3
                        value: keyframeRow.modelData.easing || ""
                        placeholder: "linear"
                        allowEmpty: true
                        disabled: root.controller.locked
                        ariaLabel: "Keyframe easing"
                        onCommit: raw => root.patchKeyframe(curveEditor.index,keyframeRow.index,{easing:raw.trim() || undefined})
                    }
                    KeyframeButton { text: "×"; label: "Delete keyframe"; enabled: !root.controller.locked && curveEditor.modelData.keyframes.length > 1; onClicked: root.patchCurve(curveEditor.index,{keyframes:curveEditor.modelData.keyframes.filter((k,i) => i !== keyframeRow.index)}) }
                }
            }
            Ui.EditorButton {
                text: "Add keyframe to curve " + (curveEditor.index+1)
                iconName: "add"
                enabled: !root.controller.locked
                onClicked: {
                    const keys = curveEditor.modelData.keyframes
                    const last = keys[keys.length-1]
                    root.patchCurve(curveEditor.index,{keyframes:keys.concat([{t:Math.min(1,(last ? last.t : 0)+0.1),value:last ? last.value : 0}])})
                }
            }
        }
    }
    Ui.Text {
        objectName: "customCurveWarning"
        width: parent.width
        visible: !root.baked && root.validationError !== ""
        text: "These curves will not play: " + root.validationError + "."
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        wrapMode: Text.WordWrap
    }
    Ui.Text { width: parent.width; visible: !root.baked; text: "Time (0–1), value, easing. linear, easeIn, easeOut, easeInOut, hold, cubic-bezier(x1,y1,x2,y2), spring(stiffness,damping,mass)"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary; wrapMode: Text.WordWrap }
    Ui.EditorButton {
        text: "Add curve"
        iconName: "add"
        visible: !root.baked
        enabled: !root.controller.locked && root.properties.some(p => !root.custom.curves.some(c => c.property === p))
        onClicked: {
            const property = root.properties.find(p => !root.custom.curves.some(c => c.property === p))
            if (property) root.setCurves(root.custom.curves.concat([{property:property,keyframes:[{t:0,value:0},{t:1,value:1}]}]))
        }
    }
}

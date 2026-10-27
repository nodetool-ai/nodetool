pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
Column {
    id: root
    required property ClipInspectorController controller
    property var custom: ({curves:[]})
    property bool sourceAnchored: false
    readonly property bool baked: custom.code !== undefined
    readonly property var properties: ["offsetX","offsetY","scale","scaleX","scaleY","rotation","rotationX","rotationY","opacity","wipeProgress","blur","brightness","saturation","contrast","hue","temperature","tint","positionX","positionY","anchorX","anchorY","trimStart","trimEnd","cameraAzimuth","cameraElevation","cameraZoom","cameraFov"]
    signal change(var custom)
    spacing: Theme.spacingMd
    function setCurves(curves) { change(Object.assign({},custom,{curves:curves})) }
    function patchCurve(index,patch) { setCurves(custom.curves.map((c,i) => i === index ? Object.assign({},c,patch) : c)) }
    function patchKeyframe(curveIndex,index,patch) {
        patchCurve(curveIndex,{keyframes:custom.curves[curveIndex].keyframes.map((k,i) => i === index ? Object.assign({},k,patch) : k)})
    }
    Text { width: parent.width; visible: root.baked; text: "Baked from JavaScript"; color: Theme.textSecondary; font.pixelSize: Theme.fontSizeSmall }
    Text { width: parent.width; visible: root.sourceAnchored; text: "Times follow the source clock. Keyframe positions are read-only here."; color: Theme.textSecondary; font.pixelSize: Theme.fontSizeSmall; wrapMode: Text.WordWrap }
    Repeater {
        model: root.baked ? [] : root.custom.curves
        Column {
            id: curveEditor
            required property var modelData
            required property int index
            width: parent.width
            spacing: Theme.spacingXs
            Row {
                spacing: Theme.spacingMd
                Text { text: "Curve " + (curveEditor.index+1); color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmall }
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
                    spacing: Theme.spacingMicro
                    InspectorPillInput {
                        minWidth: 52
                        value: root.sourceAnchored ? String(keyframeRow.modelData.sourceMs || 0)+"ms" : keyframeRow.modelData.t.toFixed(2)
                        disabled: root.controller.locked || root.sourceAnchored
                        ariaLabel: "Keyframe time"
                        scrub: ({step:0.01,min:0,max:1})
                        onCommit: raw => { const n = Number(raw); if (Number.isFinite(n)) root.patchKeyframe(curveEditor.index,keyframeRow.index,{t:Math.max(0,Math.min(1,n))}) }
                    }
                    InspectorPillInput {
                        minWidth: 64
                        value: String(keyframeRow.modelData.value)
                        disabled: root.controller.locked
                        ariaLabel: "Keyframe value"
                        onCommit: raw => { const n = Number(raw); if (Number.isFinite(n)) root.patchKeyframe(curveEditor.index,keyframeRow.index,{value:n}) }
                    }
                    InspectorPillInput {
                        minWidth: 96
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
            Button {
                text: "+ Add keyframe to curve " + (curveEditor.index+1)
                enabled: !root.controller.locked
                onClicked: {
                    const keys = curveEditor.modelData.keyframes
                    const last = keys[keys.length-1]
                    root.patchCurve(curveEditor.index,{keyframes:keys.concat([{t:Math.min(1,(last ? last.t : 0)+0.1),value:last ? last.value : 0}])})
                }
            }
        }
    }
    Text { width: parent.width; visible: !root.baked; text: "Time (0–1), value, easing. linear, easeIn, easeOut, easeInOut, hold, cubic-bezier(x1,y1,x2,y2), spring(stiffness,damping,mass)"; color: Theme.textSecondary; font.pixelSize: Theme.fontSizeSmall; wrapMode: Text.WordWrap }
    Button {
        text: "+ Add curve"
        visible: !root.baked
        enabled: !root.controller.locked && root.properties.some(p => !root.custom.curves.some(c => c.property === p))
        onClicked: {
            const property = root.properties.find(p => !root.custom.curves.some(c => c.property === p))
            if (property) root.setCurves(root.custom.curves.concat([{property:property,keyframes:[{t:0,value:0},{t:1,value:1}]}]))
        }
    }
}

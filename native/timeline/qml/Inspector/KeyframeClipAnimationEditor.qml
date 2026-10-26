pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
Column {
    id: root
    required property var animation
    required property ClipInspectorController controller
    property var options: []
    readonly property var preset: MotionAnimationCatalog.presets.find(p => p.id === animation.preset)
    readonly property bool isCustom: animation.preset === "custom"
    readonly property bool handKeyed: isCustom && animation.role === "emphasis" && (animation.delayMs || 0) === 0 && animation.params && animation.params.keyframed === true
    readonly property bool timed: !(preset && preset.fullClip) && !handKeyed
    readonly property string roleLabel: animation.role === "in" ? "In" : animation.role === "out" ? "Out" : animation.role === "loop" ? "Loop" : "Emphasis"
    signal patch(var values, string phase)
    signal presetChange(string value)
    signal remove()
    spacing: Theme.spacingMd
    function param(name,value,phase) {
        const params = Object.assign({},animation.params || {})
        params[name] = value
        patch({params:params},phase || "")
    }
    RowLayout {
        width: root.width
        Text { Layout.fillWidth: true; text: root.roleLabel; color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmall }
        KeyframeButton { text: "×"; label: "Remove " + root.roleLabel + " animation"; enabled: !root.controller.locked; onClicked: root.remove() }
    }
    InspectorToggleRow { width: root.width; label: "Enabled"; checked: root.animation.enabled !== false; disabled: root.controller.locked; onChange: next => root.patch({enabled:next},"") }
    InspectorRow { width: root.width; label: "Preset"; InspectorSelect { label: root.roleLabel + " animation preset"; value: root.animation.preset; options: root.options; disabled: root.controller.locked; onChange: next => root.presetChange(next) } }
    Repeater {
        model: root.timed ? [{field:"durationMs",label:root.animation.role === "loop" ? "Period" : "Duration",min:1},{field:"delayMs",label:"Delay",min:0}] : []
        InspectorRow {
            id: timingRow
            required property var modelData
            width: root.width
            label: modelData.label
            InspectorPillInput {
                value: String(root.animation[timingRow.modelData.field] || 0)
                unit: "ms"
                ariaLabel: root.roleLabel + " animation " + timingRow.modelData.label.toLowerCase()
                disabled: root.controller.locked
                onCommit: raw => {
                    const n = Number(raw)
                    if (Number.isFinite(n) && n >= timingRow.modelData.min) {
                        const p = {}; p[timingRow.modelData.field] = n; root.patch(p,"")
                    }
                }
            }
        }
    }
    MotionEasingField { width: root.width; visible: root.isCustom; controller: root.controller; value: root.animation.easing || ""; disabled: root.controller.locked; ariaLabel: root.roleLabel + " animation easing"; onChange: next => root.patch({easing:next || undefined},"") }
    InspectorRow {
        width: root.width
        visible: !root.isCustom
        label: "Easing"
        InspectorSelect {
            label: root.roleLabel + " animation easing"
            value: root.animation.easing || (root.preset ? root.preset.defaultEasing : "") || "linear"
            options: ["linear","easeIn","easeOut","easeInOut","easeOutBack","easeOutElastic","easeOutBounce","hold"].map(e => ({value:e,label:e === "hold" ? "Hold" : e}))
            disabled: root.controller.locked
            onChange: next => root.patch({easing:next},"")
        }
    }
    InspectorToggleRow {
        width: root.width
        visible: root.controller.clip.mediaType === "text" && !(root.preset && root.preset.fullClip)
        label: "Stagger"
        checked: !!root.animation.stagger
        disabled: root.controller.locked
        onChange: next => root.patch({stagger:next ? {unit:"word",offsetMs:120} : undefined},"")
    }
    Column {
        width: root.width
        visible: !!root.animation.stagger
        Repeater {
            model: [{field:"unit",label:"Unit",options:[{value:"word",label:"Word"},{value:"character",label:"Character"},{value:"line",label:"Line"}]},{field:"from",label:"From",options:[{value:"start",label:"Start"},{value:"end",label:"End"},{value:"center",label:"Center"}]}]
            InspectorRow {
                id: staggerRow
                required property var modelData
                width: root.width
                label: modelData.label
                InspectorSelect {
                    label: root.roleLabel + " animation stagger " + staggerRow.modelData.label.toLowerCase()
                    value: root.animation.stagger ? (root.animation.stagger[staggerRow.modelData.field] || "start") : ""
                    options: staggerRow.modelData.options
                    disabled: root.controller.locked
                    onChange: next => { const p = {}; p[staggerRow.modelData.field] = next; root.patch({stagger:Object.assign({},root.animation.stagger,p)},"") }
                }
            }
        }
        InspectorRow {
            width: root.width
            label: "Offset"
            InspectorPillInput { value: String(root.animation.stagger ? root.animation.stagger.offsetMs : 120); unit: "ms"; ariaLabel: root.roleLabel + " animation stagger offset"; disabled: root.controller.locked; onCommit: raw => { const n = Number(raw); if (Number.isFinite(n) && n > 0) root.patch({stagger:Object.assign({},root.animation.stagger,{offsetMs:n})},"") } }
        }
    }
    KeyframeClipCustomCurves {
        width: root.width
        visible: root.isCustom
        controller: root.controller
        custom: root.animation.custom || {curves:[]}
        sourceAnchored: !!(root.animation.custom && root.animation.custom.timeBase === "source")
        onChange: next => root.patch({custom:next},"")
    }
    Repeater {
        model: root.preset ? root.preset.params : []
        MotionAnimationParam {
            required property var modelData
            width: root.width
            spec: modelData
            value: root.animation.params && root.animation.params[modelData.name] !== undefined ? root.animation.params[modelData.name] : modelData.default
            controller: root.controller
            onChange: (next,phase) => root.param(spec.name,next,phase)
        }
    }
    Text { width: root.width; visible: !!root.preset; text: root.preset ? (MotionAnimationCatalog.labels.descriptions[root.preset.id] || root.preset.describe) : ""; color: Theme.textSecondary; font.pixelSize: Theme.fontSizeSmall; wrapMode: Text.WordWrap }
}

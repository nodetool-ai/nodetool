pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "AudioEffectsKnobs.js" as Effects
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    property var effect: ({})
    property var timeline: null
    property string clipId: ""
    property double generation: 0
    signal patch(var patch)
    spacing: Ui.Metrics.micro
    InspectorRow {
        visible: root.effect.type === "filter"
        width: parent.width
        label: "Mode"
        InspectorSelect {
            objectName: "audioEffectMode-" + root.effect.id
            label: "Filter mode"
            value: root.effect.mode || "lowpass"
            options: Effects.filterModes
            onChange: value => root.patch({mode: value})
        }
    }
    Repeater {
        model: Effects.knobs[root.effect.type] || []
        delegate: InspectorSliderRow {
            id: knob
            required property var modelData
            property var gesture: null
            objectName: "audioEffectKnob-" + root.effect.id + "-" + modelData.key
            width: parent.width
            label: Effects.knobLabels[modelData.key] || modelData.label
            min: modelData.min
            max: modelData.max
            step: modelData.step
            origin: modelData.origin
            value: gesture ? gesture.value : root.effect[modelData.key]
            display: Effects.formatKnob(modelData, value)
            onGestureStarted: gesture = {timeline: root.timeline, clipId: root.clipId, effectId: root.effect.id,
                generation: root.generation, value: value}
            onPreview: value => {
                if (gesture) gesture = Object.assign({}, gesture, {value: value})
            }
            onChange: value => {
                const pending = gesture
                gesture = null
                if (pending && (pending.timeline !== root.timeline || pending.clipId !== root.clipId
                    || pending.effectId !== root.effect.id || pending.generation !== root.generation)) return
                const patch = {}
                patch[modelData.key] = value
                root.patch(patch)
            }
            onCanceled: gesture = null
        }
    }
}

import QtQuick
import NodeTool.Timeline
Column {
    id: root
    required property var spec
    required property var value
    required property ClipInspectorController controller
    signal change(var value, string phase)
    Loader {
        width: parent.width
        sourceComponent: root.spec.options ? selectField : typeof root.spec.default === "boolean" ? toggleField : typeof root.spec.default === "string" || root.spec.name === "seed" ? textField : sliderField
    }
    Component {
        id: selectField
        InspectorRow {
            label: MotionAnimationCatalog.labels.params[root.spec.name] || root.spec.name
            InspectorSelect { label: MotionAnimationCatalog.labels.params[root.spec.name] || root.spec.name; value: String(root.value); options: root.spec.options.map(p => ({value:p,label:MotionAnimationCatalog.labels.paramOptions[root.spec.name] ? (MotionAnimationCatalog.labels.paramOptions[root.spec.name][p] || p) : p})); disabled: root.controller.locked; onChange: next => root.change(next,"") }
        }
    }
    Component {
        id: toggleField
        InspectorToggleRow { label: MotionAnimationCatalog.labels.params[root.spec.name] || root.spec.name; checked: root.value === true; disabled: root.controller.locked; onChange: next => root.change(next,"") }
    }
    Component {
        id: textField
        InspectorRow {
            label: MotionAnimationCatalog.labels.params[root.spec.name] || root.spec.name
            InspectorPillInput {
                value: String(root.value)
                ariaLabel: root.spec.name
                disabled: root.controller.locked
                onCommit: raw => {
                    if (root.spec.name !== "seed") { root.change(raw,""); return }
                    const n = parseInt(raw,10)
                    if (Number.isFinite(n)) root.change(Math.min(root.spec.max === undefined ? n : root.spec.max,Math.max(root.spec.min || 0,n)),"")
                }
            }
        }
    }
    Component {
        id: sliderField
        InspectorSliderRow {
            label: MotionAnimationCatalog.labels.params[root.spec.name] || root.spec.name
            min: root.spec.min === undefined ? 0 : root.spec.min
            max: root.spec.max === undefined ? 1 : root.spec.max
            step: Number.isInteger(min) && Number.isInteger(max) ? 1 : Math.max((max-min)/100,0.001)
            value: root.value
            display: Number.isInteger(value) ? String(value) : value.toFixed(3)
            origin: root.spec.default
            disabled: root.controller.locked
            onGestureStarted: root.controller.beginGesture()
            onPreview: next => root.change(next,"preview")
            onChange: next => root.change(next,"commit")
        }
    }
}

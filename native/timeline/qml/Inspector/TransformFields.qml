pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
// The parts of a clip's transform with no keyframes, as rows below the keyed ones in Effect Controls.
Column {
    id: root
    required property ClipInspectorController controller
    property bool disabled: false
    spacing: Ui.Metrics.micro
    Repeater {
        model: [{field:"anchorX",label:"Anchor X"},{field:"anchorY",label:"Anchor Y"}]
        InspectorSliderRow {
            required property var modelData
            width: root.width
            label: modelData.label
            objectName: modelData.field + "-slider"
            min: 0
            max: 1
            step: 0.01
            origin: 0.5
            value: { const clip = root.controller.clip; return root.controller.fieldValue(modelData.field) }
            display: value.toFixed(2)
            disabled: root.disabled
            function payload(next) { return {action:"field",field:modelData.field,value:next} }
            onGestureStarted: root.controller.beginGesture()
            onPreview: next => root.controller.preview(payload(next))
            onChange: next => root.controller.commit(payload(next))
            onCanceled: root.controller.cancelGesture()
        }
    }
    Repeater {
        model: [{field:"rotationX",label:"Rotation X",unit:"°",scale:180/Math.PI,step:0.5},{field:"rotationY",label:"Rotation Y",unit:"°",scale:180/Math.PI,step:0.5},{field:"perspective",label:"Perspective",unit:"px",scale:1,step:1,min:1},{field:"depthPx",label:"Depth",unit:"px",scale:1,step:1}]
        InspectorRow {
            required property var modelData
            id: spatialRow
            width: root.width
            label: modelData.label
            controlMinWidth: 0
            InspectorPillInput {
                objectName: spatialRow.modelData.field + "-input"
                minWidth: Ui.Metrics.touch * 2.1
                value: { const clip = root.controller.clip; return (root.controller.fieldValue(spatialRow.modelData.field)*spatialRow.modelData.scale).toFixed(1) }
                unit: spatialRow.modelData.unit
                ariaLabel: spatialRow.modelData.label
                disabled: root.disabled
                scrub: ({step:spatialRow.modelData.step,min:spatialRow.modelData.min})
                function payload(raw) { return {action:"field",field:spatialRow.modelData.field,value:Number(raw)/spatialRow.modelData.scale} }
                onGestureStarted: root.controller.beginGesture()
                onPreview: raw => { if (Number.isFinite(Number(raw))) root.controller.preview(payload(raw)) }
                onCommit: raw => { if (raw.trim() && Number.isFinite(Number(raw))) root.controller.commit(payload(raw)); else root.controller.cancelGesture() }
            }
        }
    }
}

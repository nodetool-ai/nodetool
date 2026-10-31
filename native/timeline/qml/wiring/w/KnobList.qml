import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Column {
    id: list
    required property var effect
    property var knobs: TrackEffectsReference.data.knobs[effect.type] ?? []
    property bool disabled: false
    signal preview(var patch)
    signal commit(var patch)
    signal editCanceled()
    spacing: Ui.Metrics.xs
    Repeater {
        model: list.knobs
        delegate: Item {
            id: row
            required property var modelData
            width: list.width
            height: Math.max(Ui.Metrics.small, label.implicitHeight, valueLabel.implicitHeight)
            enabled: !list.disabled
            function patch(value) {
                const result = {}
                result[modelData.key] = Math.max(modelData.min, Math.min(modelData.max,
                    modelData.min + Math.round((value - modelData.min) / modelData.step) * modelData.step))
                return result
            }
            Ui.Text {
                id: label
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                width: 70
                text: TrackEffectsReference.data.strings.parameters[row.modelData.key] ?? row.modelData.label
                tone: Ui.Text.Secondary
                role: Ui.Typography.SansCaption
                elide: Text.ElideRight
            }
            FxKnob {
                id: knob
                objectName: "fx-knob-" + list.effect.id + "-" + row.modelData.key
                x: 70 + Ui.Metrics.md + (parent.width - 70 - 56 - 2 * Ui.Metrics.md - width) / 2
                anchors.verticalCenter: parent.verticalCenter
                size: "xs"
                height: 34
                scale: 24 / 34
                clip: true
                label: TrackEffectsReference.data.strings.parameters[row.modelData.key] ?? row.modelData.label
                def: ({id: row.modelData.key, min: row.modelData.min, max: row.modelData.max,
                    def: TrackEffectsReference.data.defaults[list.effect.type][row.modelData.key]})
                value: list.effect[row.modelData.key]
                onDraggingChanged: TrackEffectsState.parameterGesture = dragging
                Component.onDestruction: if (dragging) TrackEffectsState.parameterGesture = false
                onChange: value => list.preview(row.patch(value))
                onGestureEnd: list.commit({})
                onGestureCanceled: list.editCanceled()
                onSetValue: value => list.commit(row.patch(value))
            }
            Ui.Text {
                id: valueLabel
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: 56
                text: Number(list.effect[row.modelData.key]).toFixed(row.modelData.digits ?? (row.modelData.step < 1 ? 2 : 0)) + (row.modelData.unit ? " " + row.modelData.unit : "")
                tone: Ui.Text.Primary
                role: Ui.Typography.SansCaption
                horizontalAlignment: Text.AlignRight
            }
        }
    }
}

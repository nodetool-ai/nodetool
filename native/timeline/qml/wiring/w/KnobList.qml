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
            readonly property real currentValue: list.effect[modelData.key] ?? TrackEffectsReference.data.defaults[list.effect.type][modelData.key]
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
                width: Ui.Metrics.standard * 2
                text: TrackEffectsReference.data.strings.parameters[row.modelData.key] ?? row.modelData.label
                tone: Ui.Text.Secondary
                role: Ui.Typography.SansCaption
                elide: Text.ElideRight
            }
            FxKnob {
                id: knob
                objectName: "fx-knob-" + list.effect.id + "-" + row.modelData.key
                x: label.width + Ui.Metrics.md + (parent.width - label.width - valueLabel.width - 2 * Ui.Metrics.md - width) / 2
                anchors.verticalCenter: parent.verticalCenter
                size: "xs"
                height: 34
                scale: 24 / 34
                clip: true
                label: TrackEffectsReference.data.strings.parameters[row.modelData.key] ?? row.modelData.label
                def: ({id: row.modelData.key, min: row.modelData.min, max: row.modelData.max,
                    def: TrackEffectsReference.data.defaults[list.effect.type][row.modelData.key]})
                value: row.currentValue
                onDraggingChanged: TrackEffectsState.parameterGesture = dragging
                Component.onDestruction: if (dragging) TrackEffectsState.parameterGesture = false
                onChange: value => list.preview(row.patch(value))
                onGestureEnd: list.commit({})
                onGestureCanceled: list.editCanceled()
                onSetValue: value => list.commit(row.patch(value))
            }
            Ui.NumberField {
                id: valueLabel
                objectName: "fx-value-" + list.effect.id + "-" + row.modelData.key
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                width: Ui.Metrics.standard * 2 + Ui.Metrics.md
                density: Ui.EditorButton.Compact
                value: row.currentValue
                displayValue: Number(value).toFixed(row.modelData.digits ?? (row.modelData.step < 1 ? 2 : 0))
                from: row.modelData.min
                to: row.modelData.max
                stepSize: row.modelData.step
                unit: row.modelData.unit ?? ""
                accessibleName: label.text
                horizontalAlignment: Text.AlignRight
                onValuePreviewed: value => list.preview(row.patch(value))
                onValueCommitted: value => list.commit(row.patch(value))
                onEditCanceled: list.editCanceled()
                onEditingChanged: TrackEffectsState.parameterGesture = editing
                Component.onDestruction: if (editing) TrackEffectsState.parameterGesture = false
            }
        }
    }
}

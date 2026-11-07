import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
EffectEditor {
    id: editor
    spacing: Ui.Metrics.xs
    Ui.Text { text: TrackEffectsReference.data.strings.mode; tone: Ui.Text.Secondary; role: Ui.Typography.SansCaption }
    FxStepper {
        enabled: !editor.disabled
        def: ({options: [TrackEffectsReference.data.strings.filter.lowPass, TrackEffectsReference.data.strings.filter.highPass, TrackEffectsReference.data.strings.filter.bandPass]})
        value: ["lowpass", "highpass", "bandpass"].indexOf(editor.effect.mode)
        onSetValue: value => editor.commit({mode: ["lowpass", "highpass", "bandpass"][value]})
    }
    KnobList {
        width: parent.width
        effect: editor.effect
        disabled: editor.disabled
        onPreview: patch => editor.preview(patch)
        onCommit: patch => editor.commit(patch)
            onEditCanceled: editor.editCanceled()
    }
}

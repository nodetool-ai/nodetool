import QtQuick
import NodeTool.Timeline
EffectEditor {
    id: editor
    spacing: Theme.spacingXs
    Text { text: TrackEffectsReference.data.strings.mode; color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller }
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
    }
}

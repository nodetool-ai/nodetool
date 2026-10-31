import QtQuick
import NodeTool.UiPrimitives as Ui
import NodeTool.Timeline
EffectEditor {
    id: editor
    spacing: Ui.Metrics.xs
    VideoPreview {
        width: parent.width
        effect: editor.effect
        disabled: editor.disabled
        vignette: false
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

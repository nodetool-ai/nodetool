import QtQuick
import NodeTool.Timeline
EffectEditor {
    id: editor
    spacing: Theme.spacingXs
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
    }
}

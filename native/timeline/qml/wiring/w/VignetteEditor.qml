import QtQuick
import NodeTool.UiPrimitives as Ui
import NodeTool.Timeline
import "../../../src/edit/clipeffects/ClipEffectsCatalog.js" as Catalog
EffectEditor {
    id: editor
    spacing: Ui.Metrics.xs
    Ui.EditorButton {
        objectName: "fx-soft-vignette-" + editor.effect.id
        text: "Soft centered oval"
        description: "Extend the feather through the corners. Keep the current intensity."
        density: Ui.EditorButton.Compact
        enabled: !editor.disabled
        onClicked: editor.commit(Catalog.softVignette)
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

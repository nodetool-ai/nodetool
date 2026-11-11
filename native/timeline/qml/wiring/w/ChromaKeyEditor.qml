import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
EffectEditor {
    id: editor
    spacing: Ui.Metrics.xs
    Row {
        spacing: Ui.Metrics.md
        Ui.Text {
            width: 70; anchors.verticalCenter: parent.verticalCenter
            text: TrackEffectsReference.data.strings.chromaKeyColor
            tone: Ui.Text.Secondary; role: Ui.Typography.SansCaption
        }
        Item {
            width: Ui.Metrics.standard; height: Ui.Metrics.standard
            Ui.ToolbarIconButton {
                id: swatchButton
                anchors.fill: parent
                enabled: !editor.disabled
                accessibleName: TrackEffectsReference.data.strings.chromaKeyColor
                onClicked: { picker.selectedColor = editor.effect.keyColor; picker.open() }
            }
            Rectangle { anchors.centerIn: parent; width: Ui.Metrics.iconSm; height: width; radius: Ui.Metrics.micro; color: editor.effect.keyColor; border.width: Ui.Metrics.border; border.color: Ui.Theme.borderControl }
        }
        Ui.Text {
            text: editor.effect.keyColor.toUpperCase()
            anchors.verticalCenter: parent.verticalCenter
            tone: Ui.Text.Primary; role: Ui.Typography.SansCaption
        }
    }
    ColorDialog {
        id: picker
        onAccepted: editor.commit({keyColor: selectedColor.toString()})
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

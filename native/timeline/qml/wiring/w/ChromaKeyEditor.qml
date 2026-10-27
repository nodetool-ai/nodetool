import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import NodeTool.Timeline
EffectEditor {
    id: editor
    spacing: Theme.spacingXs
    Row {
        spacing: Theme.spacingMd
        Text {
            width: 70; anchors.verticalCenter: parent.verticalCenter
            text: TrackEffectsReference.data.strings.chromaKeyColor
            color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller
        }
        Button {
            width: 32; height: 24
            enabled: !editor.disabled
            Accessible.name: TrackEffectsReference.data.strings.chromaKeyColor
            background: Rectangle { color: editor.effect.keyColor; radius: Theme.radiusXs; border.width: 1; border.color: Theme.divider }
            onClicked: { picker.selectedColor = editor.effect.keyColor; picker.open() }
        }
        Text {
            text: editor.effect.keyColor.toUpperCase()
            anchors.verticalCenter: parent.verticalCenter
            color: Theme.textPrimary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller
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
    }
}

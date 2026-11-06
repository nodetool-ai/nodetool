import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import NodeTool.ModelPicker
import "../assets/AssetContext.js" as Context

// The TTS model and voice of one speaker. A port of the web ScriptCastPanel voice settings.
ColumnLayout {
    id: picker
    property var binding: null
    property bool editable: true
    signal changed(var binding)
    spacing: Ui.Metrics.xs

    readonly property var voices: catalog.constraints.voices || []
    Component.onCompleted: if (binding && binding.model && binding.provider) catalog.selectModel(binding.model, binding.provider)

    function commit(model, provider, voice) { changed({provider: provider, model: model, voice: voice}) }

    ModelCatalogController { id: catalog; mode: "tts_model" }

    ModelPickerButton {
        objectName: "scriptVoiceModel"
        Layout.fillWidth: true
        catalog: catalog
        enabled: picker.editable
        placeholder: "Select a voice model"
        Accessible.name: "Voice model"
        onSelected: model => {
            const voices = catalog.constraints.voices || []
            const keep = picker.binding && voices.indexOf(picker.binding.voice) >= 0
            picker.commit(model.id, model.provider, keep ? picker.binding.voice : (voices[0] || ""))
        }
        onAddProvidersRequested: {
            const dialog = Context.itemNamed(picker.Window.window ? picker.Window.window.contentItem : null, "providerSettingsDialog")
            if (dialog) dialog.open()
        }
    }
    Ui.Select {
        objectName: "scriptVoiceName"
        Layout.fillWidth: true
        visible: picker.voices.length > 0
        enabled: picker.editable
        accessibleName: "Voice"
        options: picker.voices.map(voice => ({label: voice, value: voice}))
        value: picker.binding ? picker.binding.voice || "" : ""
        onValueCommitted: next => picker.commit(catalog.selectedModelId, catalog.selectedProvider, next)
    }
    Ui.Text { Layout.fillWidth: true; visible: catalog.error !== ""; text: catalog.error; tone: Ui.Text.Error; wrapMode: Text.Wrap }
}

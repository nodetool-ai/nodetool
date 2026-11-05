import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.ModelPicker

ColumnLayout {
    id: root
    required property var descriptor
    required property var value
    required property bool writable
    property var controller: typeof modelPickerController === "undefined" ? null : modelPickerController
    readonly property string modelType: descriptor.modelType || "language_model"
    readonly property bool huggingFace: modelType.startsWith("hf.")
    readonly property var catalog: controller ? controller.catalogFor(modelType, descriptor.allowedProviders || [], descriptor.modelTasks || []) : null
    // Saved values may be a plain id, or a Hugging Face repo with a file path.
    readonly property string selectedId: {
        if (typeof value === "string") return value
        if (!value) return ""
        if (value.repo_id) return value.repo_id + (value.path ? ":" + value.path : "")
        return value.id || ""
    }
    readonly property string storedProvider: {
        if (value && value.provider && value.provider !== "empty") return value.provider
        const allowed = descriptor.allowedProviders || []
        return typeof value === "string" && allowed.length ? allowed[0] : ""
    }
    readonly property var details: catalog && catalog.loaded && selectedId !== "" ? catalog.modelDetails(selectedId, storedProvider) : ({})
    readonly property string selectedProvider: storedProvider || details.provider || ""
    readonly property var voices: {
        if (modelType !== "tts_model") return []
        if (details.voices && details.voices.length) return details.voices
        return value && Array.isArray(value.voices) ? value.voices : []
    }
    signal valueCommitted(var value)
    spacing: Ui.Metrics.xs
    function cancelEdit() {}
    function valueFor(model) {
        if (huggingFace) {
            const separator = model.id.indexOf(":")
            return {type: modelType, repo_id: separator < 0 ? model.id : model.id.slice(0, separator),
                path: (separator < 0 ? model.path : model.id.slice(separator + 1)) || null}
        }
        const result = {type: modelType, id: model.id, provider: model.provider, name: model.name || ""}
        if (modelType === "image_model") result.path = model.path || ""
        if (Array.isArray(model.supported_tasks)) result.supported_tasks = model.supported_tasks
        if (modelType === "tts_model") {
            result.voices = model.voices || []
            result.selected_voice = result.voices.length ? result.voices[0] : ""
            result.sample_rate = model.sample_rate === undefined ? null : model.sample_rate
            result.requires_reference_text = !!model.requires_reference_text
            if (model.capabilities) result.capabilities = model.capabilities
            if (model.languages) result.languages = model.languages
        }
        return result
    }
    function commitModel(model) {
        if (writable && model && model.id) valueCommitted(valueFor(model))
    }
    function commitVoice(voice) {
        if (!writable || !value || typeof value !== "object") return
        valueCommitted(Object.assign({}, value, {selected_voice: voice}))
    }
    ModelPickerButton {
        id: button
        objectName: "model-select-" + root.descriptor.name
        Layout.fillWidth: true
        catalog: root.catalog
        enabled: root.writable && !!root.catalog
        contentAlignment: Qt.AlignLeft
        selectedId: root.selectedId
        selectedProvider: root.selectedProvider
        providerSetupAvailable: false
        accessibleName: "Select " + (root.descriptor.label || root.descriptor.name)
        onSelected: model => root.commitModel(model)
    }
    Ui.Select {
        objectName: "model-voice-" + root.descriptor.name
        visible: root.voices.length > 0
        Layout.fillWidth: true
        accessibleName: "Voice"
        enabled: root.writable
        options: root.voices.map(voice => ({label: voice, value: voice}))
        value: root.value && root.value.selected_voice ? root.value.selected_voice : ""
        onValueCommitted: voice => root.commitVoice(voice)
    }
    Ui.Text {
        objectName: "model-warning-" + root.descriptor.name
        Layout.fillWidth: true
        visible: text !== ""
        text: !root.controller ? "Connect to a server to select a model."
            : root.controller.error !== "" ? root.controller.error
            : root.catalog && root.catalog.error !== "" ? root.catalog.error
            : root.catalog && root.selectedId !== "" && root.selectedProvider !== "" && root.catalog.loaded && root.catalog.providerKeyMissing(root.selectedProvider)
                ? root.catalog.providerLabel(root.selectedProvider) + " needs an API key. Add it in Settings, or pick another model."
            : ""
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Warning
        wrapMode: Text.Wrap
    }
}

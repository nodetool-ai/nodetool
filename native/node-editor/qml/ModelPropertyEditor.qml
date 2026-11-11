import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.ModelPicker

// One model field for every type that web ModelProperty.tsx dispatches. The
// button follows ModelSelectButton.tsx: the model name, its provider or file in
// secondary text, a warning icon for a missing key, and a chevron.
ColumnLayout {
    id: root
    required property var descriptor
    required property var value
    required property bool writable
    property var controller: typeof modelPickerController === "undefined" ? null : modelPickerController
    readonly property string modelType: descriptor.modelType || "language_model"
    readonly property bool huggingFace: modelType.startsWith("hf.")
    readonly property var catalog: controller ? controller.catalogFor(modelType, descriptor.allowedProviders || [], descriptor.modelTasks || [], descriptor.nodeType || "") : null
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
    // Reading catalog.loaded and catalog.models makes the label follow each load.
    readonly property var fieldText: catalog && catalog.loaded !== undefined && catalog.models
        ? catalog.fieldLabel(modelType, value === undefined || value === null ? "" : value, storedProvider)
        : ({label: selectedId || qsTr("Select model"), secondary: "", subLabel: "", active: selectedId !== ""})
    // Only the language and image fields warn about a key, as in the web.
    readonly property string keyWarning: catalog && catalog.loaded && selectedId !== "" && selectedProvider !== ""
        && (modelType === "language_model" || modelType === "image_model") && catalog.models
        ? catalog.missingKeyWarning(selectedProvider) : ""
    readonly property var voices: {
        if (modelType !== "tts_model") return []
        const live = listOf(details.voices)
        if (live && live.length) return live
        return (value && listOf(value.voices)) || []
    }
    // Capability-aware TTS models opt in to preset voices, as TTSModelSelect.tsx.
    readonly property bool hasVoices: {
        if (voices.length === 0) return false
        const capabilities = listOf(details.capabilities) || (value ? listOf(value.capabilities) : null)
        return !capabilities || capabilities.indexOf("preset_voice") >= 0
    }
    readonly property string searchPlaceholder: {
        if (huggingFace) return qsTr("Search HuggingFace models")
        switch (modelType) {
        case "language_model": return qsTr("Search language models")
        case "image_model": return qsTr("Search image models")
        case "video_model": return qsTr("Search text-to-video models")
        case "tts_model": return qsTr("Search text-to-speech models")
        case "asr_model": return qsTr("Search speech-to-text models")
        case "music_model": return qsTr("Search text-to-music models")
        case "audio_to_audio_model": return qsTr("Search voice changers, separators, denoisers")
        case "embedding_model": return qsTr("Search embedding models")
        case "rerank_model": return qsTr("Search reranking models")
        }
        return qsTr("Search models")
    }
    signal valueCommitted(var value)
    readonly property alias popup: button.popup
    spacing: Ui.Metrics.xs
    function cancelEdit() {}
    // Catalog entries reach QML as sequence wrappers, which Array.isArray rejects.
    function listOf(entry) {
        if (!entry || typeof entry === "string" || typeof entry.length !== "number") return null
        return Array.from(entry)
    }
    function openPicker() { if (button.enabled) button.clicked() }
    function valueFor(model) {
        if (huggingFace) {
            const separator = model.id.indexOf(":")
            return {type: modelType, repo_id: separator < 0 ? model.id : model.id.slice(0, separator),
                path: (separator < 0 ? model.path : model.id.slice(separator + 1)) || null}
        }
        const result = {type: modelType, id: model.id, provider: model.provider, name: model.name || ""}
        // ImageModelSelect.tsx stores the file path and no task list.
        if (modelType === "image_model") {
            result.path = model.path || ""
        } else if (listOf(model.supported_tasks)) {
            result.supported_tasks = listOf(model.supported_tasks)
        }
        if (modelType === "tts_model") {
            delete result.supported_tasks
            result.voices = listOf(model.voices) || []
            result.selected_voice = result.voices.length ? result.voices[0] : ""
            result.sample_rate = model.sample_rate === undefined ? null : model.sample_rate
            result.requires_reference_text = !!model.requires_reference_text
            if (listOf(model.capabilities)) result.capabilities = listOf(model.capabilities)
            if (listOf(model.languages)) result.languages = listOf(model.languages)
        }
        return result
    }
    function commitModel(model) {
        if (writable && model && model.id) valueCommitted(valueFor(model))
    }
    // handleVoiceChange in TTSModelSelect.tsx keeps the stored fields and
    // refreshes the identity, name and voice list.
    function commitVoice(voice) {
        if (!writable || selectedId === "") return
        const base = typeof value === "object" && value ? value : {}
        valueCommitted(Object.assign({}, base, {type: "tts_model", id: selectedId,
            provider: details.provider || storedProvider || "empty", name: details.name || base.name || "",
            voices: voices, selected_voice: voice}))
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
        providerSetupAvailable: true
        searchPlaceholder: root.searchPlaceholder
        text: root.fieldText.label
        accessibleName: "Select " + (root.descriptor.label || root.descriptor.name)
        description: [root.fieldText.label, root.fieldText.secondary, root.keyWarning, root.fieldText.subLabel].filter(line => line !== "").join("\n")
        onSelected: model => root.commitModel(model)
        onConnectProviderRequested: provider => { if (root.controller) root.controller.openProviderSettings(provider) }
        contentItem: RowLayout {
            spacing: Ui.Metrics.sm
            layoutDirection: button.mirrored ? Qt.RightToLeft : Qt.LeftToRight
            Ui.Text {
                objectName: "model-label-" + root.descriptor.name
                role: Ui.Typography.SansLabel
                lineHeight: 1
                text: root.fieldText.label
                tone: !button.enabled ? Ui.Text.Disabled : root.fieldText.active ? Ui.Text.Primary : Ui.Text.Secondary
                elide: Text.ElideRight
                Layout.fillWidth: secondaryText.text === ""
                Layout.maximumWidth: implicitWidth
                Layout.minimumWidth: 0
                Layout.fillHeight: false
            }
            Ui.Text {
                id: secondaryText
                objectName: "model-secondary-" + root.descriptor.name
                role: Ui.Typography.SansCaption
                lineHeight: 1
                text: root.fieldText.secondary
                visible: text !== ""
                tone: Ui.Text.Secondary
                elide: Text.ElideRight
                Layout.fillWidth: true
                Layout.minimumWidth: 0
            }
            Ui.Icon {
                objectName: "model-key-warning-" + root.descriptor.name
                visible: root.keyWarning !== ""
                name: "warning"
                tone: Ui.Text.Warning
                Accessible.name: root.keyWarning
                Layout.preferredWidth: Ui.Metrics.iconSm
                Layout.preferredHeight: Ui.Metrics.iconSm
            }
            Ui.Icon {
                name: "arrowDropDown"
                tone: button.enabled ? Ui.Text.Secondary : Ui.Text.Disabled
                Layout.preferredWidth: Ui.Metrics.iconSm
                Layout.preferredHeight: Ui.Metrics.iconSm
            }
        }
    }
    Ui.Select {
        objectName: "model-voice-" + root.descriptor.name
        visible: root.hasVoices
        Layout.fillWidth: true
        accessibleName: "Voice"
        enabled: root.writable
        options: root.voices.map(voice => ({label: voice, value: voice}))
        value: root.value && root.value.selected_voice ? root.value.selected_voice : (root.voices.length ? root.voices[0] : "")
        onValueCommitted: voice => root.commitVoice(voice)
    }
    Ui.Text {
        objectName: "model-warning-" + root.descriptor.name
        Layout.fillWidth: true
        visible: text !== ""
        text: !root.controller ? "Connect to a server to select a model."
            : root.controller.error !== "" ? root.controller.error
            : root.catalog && root.catalog.error !== "" ? root.catalog.error
            : ""
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Warning
        wrapMode: Text.Wrap
    }
}

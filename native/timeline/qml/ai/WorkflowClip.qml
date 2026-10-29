pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline

ColumnLayout {
    id: root
    required property TimelineModel timeline
    required property ClipGestureController gestures
    required property var controller
    readonly property string clipId: gestures && gestures.selection.length === 1 ? gestures.selection[0] : ""
    readonly property var selectedClip: inspector.clip
    readonly property string workflowId: selectedClip.workflowId || ""
    property var pickerRow: null
    property string pickerClipId: ""
    visible: clipId !== "" && !!selectedClip.workflowId && !!selectedClip.selectedOutputNodeId
    spacing: Theme.spacingMd

    function loadInputs() {
        if (visible && clipId !== "") controller.loadWorkflowInputs(clipId)
    }
    function put(row, value) {
        if (controller.workflowInputClipId === clipId && !inspector.locked)
            controller.setWorkflowInput(clipId, row.name, value)
    }
    function mediaKind(kind) {
        return ({image_list: "image", video_list: "video", audio_list: "audio", text_list: "text", model3d: "model_3d"})[kind] || kind
    }
    function mediaPickerKind(kind) {
        return ["image", "video", "audio", "document", "dataframe", "folder", "model3d", "image_list", "video_list", "audio_list", "text_list"].includes(kind)
    }
    function assetMatches(asset, kind) {
        const content = String(asset.content_type || "")
        if (content === "folder") return true
        const target = mediaKind(kind)
        if (target === "folder") return false
        if (target === "model_3d") return content.startsWith("model/") || /\.gl(?:b|tf)$/i.test(asset.name || "")
        if (target === "document") return content.startsWith("text/") || content === "application/pdf"
        if (target === "dataframe") return content.includes("csv") || content.includes("parquet")
        return content.startsWith(target + "/")
    }
    function pickAsset(asset) {
        if (!pickerRow || pickerClipId !== clipId || controller.workflowInputClipId !== clipId) return
        const kind = pickerRow.kind
        const item = kind === "folder" ? {type: "folder", uri: "asset://" + asset.id, asset_id: asset.id} :
                     {type: mediaKind(kind), uri: "asset://" + asset.id, asset_id: asset.id}
        if (kind.endsWith("_list")) {
            const current = Array.isArray(pickerRow.value) ? pickerRow.value.slice() : []
            if (!current.some(entry => entry && entry.asset_id === asset.id)) current.push(item)
            put(pickerRow, current)
        } else put(pickerRow, item)
        assetPicker.close()
    }
    onVisibleChanged: loadInputs()
    onClipIdChanged: loadInputs()
    onWorkflowIdChanged: loadInputs()
    ClipInspectorController { id: inspector; timeline: root.timeline; clipId: root.clipId }
    AssetBrowser { id: assetBrowser; timeline: root.timeline }

    RowLayout {
        Layout.fillWidth: true
        Label { text: "Workflow: " + (root.selectedClip.name || "Clip"); color: Theme.textSecondary; Layout.fillWidth: true; elide: Text.ElideRight }
        Button {
            objectName: "generateWorkflowClip"
            text: root.controller.busy ? "Cancel" : "Run workflow"
            enabled: root.controller.ready && !inspector.locked && (root.controller.busy ||
                     (root.controller.workflowInputClipId === root.clipId && !root.controller.workflowInputsLoading && root.controller.workflowInputsError === ""))
            onClicked: root.controller.busy ? root.controller.cancel() : root.controller.submitWorkflow(root.clipId)
        }
    }
    Label {
        visible: root.controller.workflowInputClipId === root.clipId && root.controller.workflowInputsLoading
        text: "Loading workflow inputs…"
        color: Theme.textSecondary
    }
    RowLayout {
        visible: root.controller.workflowInputClipId === root.clipId && root.controller.workflowInputsError !== ""
        Layout.fillWidth: true
        Label { text: root.controller.workflowInputsError; color: Theme.error; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Button { text: "Retry"; onClicked: root.controller.loadWorkflowInputs(root.clipId) }
    }
    Label {
        visible: root.controller.workflowInputClipId === root.clipId && !root.controller.workflowInputsLoading && root.controller.workflowInputsError === ""
        objectName: "workflowCost"
        text: "Estimated run cost: " + (root.controller.workflowCostLabel || (root.controller.workflowCostDetail === "Estimating cost…" ? "Estimating…" : "Unknown"))
        color: Theme.textSecondary
        wrapMode: Text.Wrap
        Layout.fillWidth: true
    }
    Label {
        visible: root.controller.workflowInputClipId === root.clipId && !!root.controller.workflowCostDetail
        text: root.controller.workflowCostDetail || ""
        color: Theme.textSecondary
        wrapMode: Text.Wrap
        Layout.fillWidth: true
    }
    Repeater {
        model: root.controller.workflowInputClipId === root.clipId ? root.controller.workflowInputs : []
        delegate: ColumnLayout {
            id: field
            required property var modelData
            readonly property var row: modelData
            Layout.fillWidth: true
            spacing: Theme.spacingXs
            Label { text: field.row.label || field.row.name; color: Theme.textPrimary; Layout.fillWidth: true; wrapMode: Text.Wrap }
            Label { visible: !!field.row.description; text: field.row.description || ""; color: Theme.textSecondary; Layout.fillWidth: true; wrapMode: Text.Wrap }
            Loader {
                Layout.fillWidth: true
                sourceComponent: field.row.kind === "boolean" ? booleanField : field.row.kind === "color" ? colorField : field.row.kind === "select" ? selectField :
                    field.row.kind === "image_size" ? imageSizeField :
                    ["image_list", "video_list", "audio_list", "text_list"].includes(field.row.kind) ? listField :
                    ["language_model", "image_model", "video_model", "tts_model", "asr_model", "music_model", "embedding_model", "huggingface_model"].includes(field.row.kind) ? modelField :
                    field.row.kind === "integer" || field.row.kind === "float" ? numberField :
                    ["string", "file_path", "folder_path"].includes(field.row.kind) ? textField : structuredField
            }
            Component {
                id: listField
                ColumnLayout {
                    id: listControl
                    readonly property var items: Array.isArray(field.row.value) ? field.row.value : []
                    Layout.fillWidth: true
                    Repeater {
                        model: listControl.items
                        delegate: RowLayout {
                            id: listItem
                            required property var modelData
                            required property int index
                            Layout.fillWidth: true
                            Label {
                                Layout.fillWidth: true
                                text: typeof listItem.modelData === "string" ? listItem.modelData : (listItem.modelData && (listItem.modelData.name || listItem.modelData.asset_id || listItem.modelData.uri) || JSON.stringify(listItem.modelData))
                                color: Theme.textSecondary
                                elide: Text.ElideRight
                            }
                            Button {
                                objectName: "workflowInputRemove_" + field.row.name + "_" + listItem.index
                                text: "Remove"
                                enabled: !inspector.locked
                                onClicked: {
                                    const next = listControl.items.slice()
                                    next.splice(listItem.index, 1)
                                    root.put(field.row, next)
                                }
                            }
                        }
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        TextField {
                            id: listText
                            objectName: "workflowInputListText_" + field.row.name
                            visible: field.row.kind === "text_list"
                            Layout.fillWidth: true
                            color: Theme.textPrimary
                            placeholderText: "Add text"
                            enabled: !inspector.locked
                            Accessible.name: (field.row.label || field.row.name) + " text item"
                        }
                        Button {
                            visible: field.row.kind === "text_list"
                            text: "Add text"
                            enabled: !inspector.locked && listText.text !== ""
                            onClicked: { root.put(field.row, [...listControl.items, listText.text]); listText.clear() }
                        }
                        Button {
                            objectName: "workflowInputListAsset_" + field.row.name
                            text: "Add asset"
                            enabled: !inspector.locked
                            onClicked: { root.pickerRow = field.row; root.pickerClipId = root.clipId; assetBrowser.refresh(); assetPicker.open() }
                        }
                    }
                }
            }
            Component {
                id: imageSizeField
                RowLayout {
                    id: sizeControl
                    readonly property var sizeValue: field.row.value && typeof field.row.value === "object" ? field.row.value : ({width: 1024, height: 1024})
                    property bool locked: false
                    property real aspect: 1
                    // Mirrors IMAGE_SIZE_PRESETS in web/src/config/constants.ts.
                    readonly property var presets: [
                        {label: "NTSC SD", width: 720, height: 480},
                        {label: "PAL SD", width: 720, height: 576},
                        {label: "720p HD", width: 1280, height: 720},
                        {label: "1080p Full HD", width: 1920, height: 1080},
                        {label: "DCI 2K Cinema", width: 2048, height: 1080},
                        {label: "QHD 2K", width: 2560, height: 1440},
                        {label: "4K UHD", width: 3840, height: 2160},
                        {label: "DCI 4K Cinema", width: 4096, height: 2160},
                        {label: "iMac 5K", width: 5120, height: 2880},
                        {label: "Cinema 6K RED BMPCC", width: 6144, height: 3160},
                        {label: "Canon R5C 6K", width: 6016, height: 3200},
                        {label: "8K UHD", width: 7680, height: 4320},
                        {label: "8K DCI Cinema", width: 8192, height: 4320},
                        {label: "9:16 Social Media", width: 1080, height: 1920},
                        {label: "4K Vertical", width: 2160, height: 3840},
                        {label: "2.39:1 Cinema Anamorphic", width: 2048, height: 858},
                        {label: "1.85:1 Cinema", width: 1998, height: 1080},
                        {label: "2.39:1 Cinema 4K", width: 4096, height: 1716},
                        {label: "iPhone 16 Pro Max", width: 440, height: 956},
                        {label: "iPhone 16 Pro", width: 402, height: 874},
                        {label: "iPhone 16", width: 390, height: 844},
                        {label: "iPhone SE", width: 375, height: 667},
                        {label: "Android large", width: 360, height: 800},
                        {label: "iPad Pro 13\"", width: 1032, height: 1376},
                        {label: "iPad Pro 11\"", width: 834, height: 1194},
                        {label: "iPad Mini", width: 744, height: 1133},
                        {label: "Surface Pro 8", width: 1368, height: 912},
                        {label: "MacBook Pro 14\"", width: 1512, height: 982},
                        {label: "MacBook Pro 16\"", width: 1728, height: 1117},
                        {label: "iMac 24\"", width: 2240, height: 1260},
                        {label: "Instagram post", width: 1080, height: 1080},
                        {label: "Facebook post", width: 1200, height: 630},
                        {label: "Twitter post", width: 1200, height: 675},
                        {label: "YouTube thumbnail", width: 1280, height: 720},
                        {label: "A4", width: 595, height: 842},
                        {label: "A5", width: 420, height: 595},
                        {label: "Letter", width: 612, height: 792}
                    ]
                    function setDimension(name, raw) {
                        const value = Number(raw)
                        if (!Number.isFinite(value) || value < 1 || Math.floor(value) !== value) return
                        const next = Object.assign({}, sizeValue)
                        next[name] = value
                        if (locked && aspect > 0) next[name === "width" ? "height" : "width"] = Math.max(1, Math.round(name === "width" ? value / aspect : value * aspect))
                        delete next.preset
                        root.put(field.row, next)
                    }
                    Label { text: "Width"; color: Theme.textSecondary }
                    TextField {
                        objectName: "workflowInputWidth_" + field.row.name
                        Layout.fillWidth: true
                        color: Theme.textPrimary
                        text: String(sizeControl.sizeValue.width ?? 1024)
                        enabled: !inspector.locked
                        inputMethodHints: Qt.ImhDigitsOnly
                        Accessible.name: (field.row.label || field.row.name) + " width"
                        onEditingFinished: sizeControl.setDimension("width", text)
                    }
                    Label { text: "Height"; color: Theme.textSecondary }
                    TextField {
                        objectName: "workflowInputHeight_" + field.row.name
                        Layout.fillWidth: true
                        color: Theme.textPrimary
                        text: String(sizeControl.sizeValue.height ?? 1024)
                        enabled: !inspector.locked
                        inputMethodHints: Qt.ImhDigitsOnly
                        Accessible.name: (field.row.label || field.row.name) + " height"
                        onEditingFinished: sizeControl.setDimension("height", text)
                    }
                    ComboBox {
                        objectName: "workflowInputPreset_" + field.row.name
                        model: sizeControl.presets
                        textRole: "label"
                        currentIndex: -1
                        displayText: "Presets"
                        enabled: !inspector.locked
                        Accessible.name: (field.row.label || field.row.name) + " preset"
                        onActivated: index => {
                            const preset = sizeControl.presets[index]
                            const next = Object.assign({}, sizeControl.sizeValue, {width: preset.width, height: preset.height, preset: preset.label})
                            if (sizeControl.locked) sizeControl.aspect = preset.width / preset.height
                            root.put(field.row, next)
                            currentIndex = -1
                        }
                    }
                    Button {
                        objectName: "workflowInputLock_" + field.row.name
                        text: sizeControl.locked ? "Unlock ratio" : "Lock ratio"
                        enabled: !inspector.locked
                        onClicked: {
                            if (!sizeControl.locked) sizeControl.aspect = (sizeControl.sizeValue.width || 1024) / (sizeControl.sizeValue.height || 1024)
                            sizeControl.locked = !sizeControl.locked
                        }
                    }
                    Button {
                        text: "Swap"
                        enabled: !inspector.locked
                        onClicked: {
                            const next = Object.assign({}, sizeControl.sizeValue, {width: sizeControl.sizeValue.height, height: sizeControl.sizeValue.width})
                            delete next.preset
                            if (sizeControl.locked) sizeControl.aspect = next.width / next.height
                            root.put(field.row, next)
                        }
                    }
                    Button { text: "Clear"; enabled: !inspector.locked; onClicked: root.put(field.row, null) }
                }
            }
            Component {
                id: modelField
                ColumnLayout {
                    id: modelControl
                    Layout.fillWidth: true
                    readonly property var selected: field.row.value && typeof field.row.value === "object" ? field.row.value : ({})
                    readonly property string selectedId: typeof field.row.value === "string" ? field.row.value : (selected.repo_id || selected.id || "")
                    ModelCatalogController { id: modelCatalog; mode: field.row.kind }
                    ComboBox {
                        objectName: "workflowInputModelScope_" + field.row.name
                        visible: field.row.kind === "huggingface_model"
                        model: ["Server cache", "Worker cache"]
                        Accessible.name: "Hugging Face model source"
                        onActivated: index => modelCatalog.modelScope = index === 0 ? "local" : "worker"
                    }
                    ComboBox {
                        id: workflowModel
                        objectName: "workflowInputModel_" + field.row.name
                        Layout.fillWidth: true
                        model: modelCatalog.models
                        textRole: "name"
                        delegate: ItemDelegate {
                            required property var modelData
                            width: workflowModel.width
                            text: (modelData.name || modelData.id) + " (" + modelData.provider + ")"
                        }
                        currentIndex: {
                            for (let i = 0; i < modelCatalog.models.length; ++i) {
                                const candidate = modelCatalog.models[i]
                                if (field.row.kind === "huggingface_model") {
                                    const parts = candidate.id.split(":")
                                    if (parts[0] === modelControl.selectedId && (parts[1] || candidate.path || "") === (modelControl.selected.path || "")) return i
                                } else if (candidate.id === modelControl.selectedId && (!modelControl.selected.provider || candidate.provider === modelControl.selected.provider)) return i
                            }
                            return -1
                        }
                        displayText: currentIndex >= 0 ? currentText + " (" + modelCatalog.models[currentIndex].provider + ")" : modelControl.selectedId || (modelCatalog.loading ? "Loading models…" : "Select model")
                        enabled: !inspector.locked
                        Accessible.name: field.row.label || field.row.name
                        onActivated: index => {
                            const chosen = modelCatalog.models[index]
                            if (field.row.kind === "huggingface_model") {
                                const parts = chosen.id.split(":")
                                const repo = parts[0]
                                const path = parts[1] || chosen.path || null
                                if (repo === modelControl.selectedId && (path || "") === (modelControl.selected.path || "")) return
                                const modelType = String(modelControl.selected.type || "hf.model")
                                root.put(field.row, {type: modelType.startsWith("hf.") ? modelType : "hf.model", repo_id: repo, path: path})
                                return
                            }
                            if (chosen.id === modelControl.selectedId && chosen.provider === modelControl.selected.provider) return
                            const value = {type: field.row.kind, id: chosen.id, provider: chosen.provider, name: chosen.name || ""}
                            if (chosen.supported_tasks) value.supported_tasks = chosen.supported_tasks
                            if (field.row.kind === "image_model") value.path = chosen.path || ""
                            if (field.row.kind === "tts_model") {
                                value.voices = chosen.voices || []
                                value.selected_voice = value.voices.length ? value.voices[0] : ""
                                if (chosen.capabilities !== undefined) value.capabilities = chosen.capabilities
                                if (chosen.languages !== undefined) value.languages = chosen.languages
                                value.sample_rate = chosen.sample_rate ?? null
                                value.requires_reference_text = chosen.requires_reference_text || false
                            }
                            root.put(field.row, value)
                        }
                    }
                    Label { visible: modelCatalog.error !== ""; text: modelCatalog.error; color: Theme.error; Layout.fillWidth: true; wrapMode: Text.Wrap }
                    ComboBox {
                        objectName: "workflowInputVoice_" + field.row.name
                        visible: field.row.kind === "tts_model" && modelControl.selectedId !== "" && modelControl.selected.voices && modelControl.selected.voices.length > 0
                        Layout.fillWidth: true
                        model: modelControl.selected.voices || []
                        currentIndex: { const index = model.indexOf(modelControl.selected.selected_voice || ""); return index < 0 ? -1 : index }
                        enabled: !inspector.locked
                        Accessible.name: (field.row.label || field.row.name) + " voice"
                        onActivated: index => root.put(field.row, Object.assign({}, modelControl.selected, {selected_voice: model[index]}))
                    }
                    Button { text: "Clear"; enabled: !inspector.locked; onClicked: root.put(field.row, null) }
                }
            }
            Component {
                id: booleanField
                CheckBox {
                    objectName: "workflowInput_" + field.row.name
                    text: field.row.label || field.row.name
                    checked: !!field.row.value
                    enabled: !inspector.locked
                    onClicked: root.put(field.row, checked)
                }
            }
            Component {
                id: colorField
                TextField {
                    objectName: "workflowInput_" + field.row.name
                    color: Theme.textPrimary
                    text: typeof field.row.value === "string" ? field.row.value : (field.row.value && field.row.value.value) || ""
                    enabled: !inspector.locked
                    placeholderText: "#RRGGBB"
                    Accessible.name: field.row.label || field.row.name
                    onEditingFinished: root.put(field.row, { type: "color", value: text.trim() === "" ? null : text.trim() })
                }
            }
            Component {
                id: selectField
                ComboBox {
                    objectName: "workflowInput_" + field.row.name
                    model: field.row.options || []
                    currentIndex: { const index = model.indexOf(field.row.value); return index < 0 ? -1 : index }
                    enabled: !inspector.locked
                    Accessible.name: field.row.label || field.row.name
                    onActivated: index => root.put(field.row, model[index])
                }
            }
            Component {
                id: numberField
                TextField {
                    id: numberInput
                    objectName: "workflowInput_" + field.row.name
                    color: Theme.textPrimary
                    text: field.row.hasValue ? String(field.row.value) : ""
                    enabled: !inspector.locked
                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                    Accessible.name: field.row.label || field.row.name
                    onEditingFinished: {
                        if (text.trim() === "") return
                        let value = Number(text)
                        if (!Number.isFinite(value)) { text = field.row.hasValue ? String(field.row.value) : ""; return }
                        if (field.row.kind === "integer") value = Math.trunc(value)
                        if (typeof field.row.min === "number") value = Math.max(field.row.min, value)
                        if (typeof field.row.max === "number") value = Math.min(field.row.max, value)
                        root.put(field.row, value)
                    }
                }
            }
            Component {
                id: textField
                ColumnLayout {
                    TextField {
                        objectName: "workflowInput_" + field.row.name
                        visible: !field.row.multiline
                        Layout.fillWidth: true
                        text: field.row.hasValue ? String(field.row.value) : ""
                        color: Theme.textPrimary
                        maximumLength: field.row.maxLength > 0 ? field.row.maxLength : 32767
                        enabled: !inspector.locked
                        Accessible.name: field.row.label || field.row.name
                        onEditingFinished: root.put(field.row, text)
                    }
                    TextArea {
                        objectName: "workflowInputMultiline_" + field.row.name
                        visible: !!field.row.multiline
                        Layout.fillWidth: true
                        Layout.preferredHeight: 80
                        text: field.row.hasValue ? String(field.row.value) : ""
                        color: Theme.textPrimary
                        wrapMode: TextEdit.Wrap
                        enabled: !inspector.locked
                        Accessible.name: field.row.label || field.row.name
                        onEditingFinished: root.put(field.row, field.row.maxLength > 0 ? text.slice(0, field.row.maxLength) : text)
                    }
                }
            }
            Component {
                id: structuredField
                ColumnLayout {
                    id: structured
                    property string jsonError: ""
                    TextArea {
                        id: jsonInput
                        objectName: "workflowInputJson_" + field.row.name
                        Layout.fillWidth: true
                        Layout.preferredHeight: 70
                        text: field.row.hasValue ? JSON.stringify(field.row.value, null, 2) : ""
                        color: Theme.textPrimary
                        wrapMode: TextEdit.Wrap
                        enabled: !inspector.locked
                        Accessible.name: (field.row.label || field.row.name) + " JSON"
                    }
                    RowLayout {
                        Button {
                            objectName: "workflowInputApply_" + field.row.name
                            text: "Apply value"
                            enabled: !inspector.locked
                            onClicked: {
                                try {
                                    const parsed = JSON.parse(jsonInput.text)
                                    if (field.row.kind.endsWith("_list") && parsed !== null && !Array.isArray(parsed)) throw new Error("Expected an array")
                                    if (field.row.kind !== "value" && !field.row.kind.endsWith("_list") && parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) throw new Error("Expected an object")
                                    root.put(field.row, parsed)
                                    structured.jsonError = ""
                                } catch (error) { structured.jsonError = "Enter a valid JSON value of the expected type." }
                            }
                        }
                        Button {
                            visible: root.mediaPickerKind(field.row.kind)
                            text: "Choose asset"
                            enabled: !inspector.locked
                            onClicked: { root.pickerRow = field.row; root.pickerClipId = root.clipId; assetBrowser.refresh(); assetPicker.open() }
                        }
                    }
                    Label { visible: structured.jsonError !== ""; text: structured.jsonError; color: Theme.error }
                }
            }
        }
    }
    // The dialog is reparented to the window overlay rather than laid out here.
    // qmllint disable Quick.layout-positioning
    property var assetPickerPopup: Dialog {
        id: assetPicker
        objectName: "workflowInputAssetPicker"
        parent: Overlay.overlay
        anchors.centerIn: parent
        width: Math.min(480, (parent ? parent.width : 0) - 2 * Theme.spacingXl)
        height: Math.min(500, (parent ? parent.height : 0) - 2 * Theme.spacingXl)
        modal: true
        title: "Choose asset"
        background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusMd }
        contentItem: ColumnLayout {
            Button { text: "Up"; visible: assetBrowser.folderId !== ""; onClicked: assetBrowser.goUp() }
            Label { visible: assetBrowser.error !== ""; text: assetBrowser.error; color: Theme.error; Layout.fillWidth: true; wrapMode: Text.Wrap }
            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: assetBrowser.assets
                delegate: ItemDelegate {
                    required property var modelData
                    width: ListView.view.width
                    visible: root.pickerRow && root.assetMatches(modelData, root.pickerRow.kind)
                    height: visible ? implicitHeight : 0
                    text: (modelData.content_type === "folder" ? "Folder: " : "") + (modelData.name || modelData.id)
                    onClicked: {
                        if (modelData.content_type === "folder" && root.pickerRow.kind !== "folder") assetBrowser.openFolder(modelData.id)
                        else root.pickAsset(modelData)
                    }
                }
            }
        }
        footer: DialogButtonBox {
            Button { text: "Close"; DialogButtonBox.buttonRole: DialogButtonBox.RejectRole }
            onRejected: assetPicker.close()
        }
    }
}

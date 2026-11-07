import QtQuick
import QtQuick.Layouts
import QtQuick.Dialogs
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "asset-editor-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    required property string nodeId
    property var controller: typeof assetPickerController === "undefined" ? null : assetPickerController
    property string requestKey: "property-asset-" + String(root)
    property int generation: 0
    readonly property string listKey: requestKey + "-list-" + generation
    readonly property string uploadKey: requestKey + "-upload-" + generation
    property bool previewReady: true
    property bool multipleFiles: false
    readonly property string mediaKind: descriptor ? descriptor.mediaType || (descriptor.dataType ? descriptor.dataType.type || "" : "") : ""
    property var uploadFilesPending: []
    property var uploadedReferences: []
    property var assets: []
    property string searchText: ""
    property string nextCursor: ""
    property bool searched: false
    property bool listing: false
    property bool uploading: false
    property real uploadProgress: 0
    property string error: ""
    property string editNodeId: ""
    signal valueCommitted(var value)
    signal scopeInvalidated()
    signal referencesCommitted(var values)
    spacing: Ui.Metrics.xs
    function search(more) {
        if (!controller || !writable) return
        listing = true; error = ""
        if (!more) { assets = []; nextCursor = "" }
        controller.search(listKey, mediaKind, searchText, more ? nextCursor : "")
    }
    function cancelEdit() {
        picker.close()
        if (controller) { controller.cancel(listKey); controller.cancel(uploadKey) }
        ++generation
        listing = false; uploading = false; uploadProgress = 0; uploadFilesPending = []; uploadedReferences = []; error = ""; searchText = ""; editNodeId = ""
    }
    function resetScope() { cancelEdit(); assets = []; nextCursor = ""; searched = false; previewReady = false; previewRestart.restart() }
    function uploadFiles(urls) {
        if (!controller || !writable || !urls || !urls.length) return
        editNodeId = nodeId; uploading = true; error = ""; uploadProgress = 0
        uploadFilesPending = Array.from(urls); uploadedReferences = []
        uploadNext()
    }
    function uploadNext() {
        if (!controller || !writable || !uploading || editNodeId !== nodeId) return
        controller.upload(uploadKey, mediaKind, uploadFilesPending[uploadedReferences.length])
    }
    function uploadFile(url) { uploadFiles([url]) }
    function emitReference(reference) {
        if (multipleFiles) { referencesCommitted([reference]); return }
        const prior = value && typeof value === "object" ? value : {}
        const result = Object.assign({}, prior, reference)
        delete result.temp_id; delete result.data
        if (prior.id) result.id = reference.asset_id
        valueCommitted(result)
    }
    function selectAsset(id) {
        if (!writable || !assets.some(asset => asset.id === id)) return
        emitReference({type: mediaKind, asset_id: id, uri: "asset://" + id})
    }
    onNodeIdChanged: resetScope()
    onMediaKindChanged: resetScope()
    onWritableChanged: if (!writable) resetScope()
    Component.onDestruction: cancelEdit()
    Connections {
        target: root.controller
        function onCleared() { root.resetScope(); root.scopeInvalidated() }
        function onListed(key, rows, next) {
            if (key !== root.listKey || !root.writable) return
            root.listing = false
            root.searched = true
            root.assets = root.assets.concat(rows.filter(row => !root.assets.some(asset => asset.id === row.id)))
            root.nextCursor = next
        }
        function onUploaded(key, reference) {
            if (key !== root.uploadKey || !root.writable || root.editNodeId !== root.nodeId) return
            root.uploadedReferences = root.uploadedReferences.concat([reference])
            if (root.uploadedReferences.length < root.uploadFilesPending.length) { Qt.callLater(root.uploadNext); return }
            root.uploading = false
            if (root.multipleFiles) root.referencesCommitted(root.uploadedReferences)
            else root.emitReference(root.uploadedReferences[0])
        }
        function onProgress(key, sent, total) { if (key === root.uploadKey && total > 0) root.uploadProgress = (root.uploadedReferences.length + sent / total) / Math.max(1, root.uploadFilesPending.length) }
        function onFailed(key, message) {
            if (key !== root.listKey && key !== root.uploadKey) return
            if (key === root.listKey) root.listing = false
            if (key === root.uploadKey) root.uploading = false
            root.error = message
        }
    }
    Ui.Text {
        Layout.fillWidth: true
        visible: root.mediaKind === "asset" && root.value !== null && root.value !== undefined
        text: root.value ? String(root.value.asset_id || root.value.id || root.value.uri || "") : ""
        role: Ui.Typography.SansCaption
        wrapMode: Text.WrapAnywhere
    }
    Loader {
        Layout.fillWidth: true
        active: root.previewReady && root.mediaKind !== "asset" && root.value !== null && root.value !== undefined
        sourceComponent: Component {
            MediaPreview {
                mediaKind: root.mediaKind
                locator: root.value
                requestKey: root.requestKey + "-preview"
            }
        }
    }
    Ui.TextField {
        Layout.fillWidth: true
        objectName: "asset-search-" + root.descriptor.name
        value: root.searchText
        accessibleName: "Search " + root.mediaKind + " assets"
        placeholderText: "Search existing assets"
        enabled: root.writable && !root.uploading
        onValueCommitted: value => { root.searchText = value; root.search(false) }
    }
    RowLayout {
        spacing: Ui.Metrics.xs
        NodeButton {
            objectName: "asset-refresh-" + root.descriptor.name
            text: "Browse assets"
            enabled: root.writable && root.controller && !root.uploading
            onClicked: root.search(false)
        }
        NodeButton {
            objectName: "asset-upload-" + root.descriptor.name
            text: "Upload file"
            enabled: root.writable && root.controller && !root.uploading
            onClicked: { root.editNodeId = root.nodeId; picker.open() }
        }
    }
    Ui.Select {
        objectName: "asset-select-" + root.descriptor.name
        Layout.fillWidth: true
        accessibleName: "Select " + root.mediaKind + " asset"
        enabled: root.writable && !root.uploading && root.assets.length > 0
        options: root.assets.map(asset => ({label: asset.name || asset.id, value: asset.id}))
        value: root.value && root.value.asset_id ? root.value.asset_id : ""
        onValueCommitted: value => root.selectAsset(value)
    }
    NodeButton {
        visible: root.nextCursor !== ""
        text: "Load more assets"
        enabled: root.writable && !root.listing
        onClicked: root.search(true)
    }
    RowLayout {
        visible: root.uploading
        Ui.Text { text: "Uploading " + Math.round(root.uploadProgress * 100) + "%"; role: Ui.Typography.SansCaption }
        NodeButton { text: "Cancel upload"; onClicked: root.cancelEdit() }
    }
    Ui.Text {
        Layout.fillWidth: true
        text: root.error || (!root.controller ? "Connect to a server to choose media." : root.listing ? "Loading assets…" : root.assets.length === 0 ? (root.searched ? "No matching assets. Change the search or upload a file." : "Browse your library or upload a file.") : "")
        visible: text !== ""
        role: Ui.Typography.SansCaption
        tone: root.error ? Ui.Text.Error : Ui.Text.Secondary
        wrapMode: Text.Wrap
    }
    DropArea {
        objectName: "asset-drop-" + root.descriptor.name
        Layout.fillWidth: true
        implicitHeight: Ui.Metrics.touch
        enabled: root.writable && root.controller && !root.uploading
        onDropped: drop => { if (drop.hasUrls && (root.multipleFiles || drop.urls.length === 1)) { root.uploadFiles(drop.urls); drop.acceptProposedAction() } }
        Ui.Text { anchors.centerIn: parent; text: "Drop an " + root.mediaKind + " file"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
    }
    Timer { id: previewRestart; interval: 0; onTriggered: root.previewReady = true }
    FileDialog {
        id: picker
        title: "Upload " + root.mediaKind
        fileMode: root.multipleFiles ? FileDialog.OpenFiles : FileDialog.OpenFile
        nameFilters: root.mediaKind === "image" ? ["Images (*.png *.jpg *.jpeg *.webp *.gif *.bmp *.svg)"]
            : root.mediaKind === "audio" ? ["Audio (*.wav *.mp3 *.flac *.ogg *.m4a *.aac)"] : root.mediaKind === "video" ? ["Video (*.mp4 *.webm *.mov *.mkv *.avi)"] : ["All files (*)"]
        onAccepted: if (root.writable && root.editNodeId === root.nodeId) root.uploadFiles(root.multipleFiles ? selectedFiles : [selectedFile])
    }
}

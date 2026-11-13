import QtQuick
import QtQuick.Window
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
    // Hover text for the window's tool tip; empty hides it.
    signal toolTipRequested(string text)
    // The tab's AssetPickerController, MediaResolver and ResourcePickerController,
    // from the property host. A field without them only shows its value.
    property var controller: null
    property var dialogProvider: null
    property var resolver: null
    readonly property string documentKey: requestKey + "-document-" + generation
    property var documentAsset: ({})
    property url documentUrl: ""
    property string documentText: ""
    property var resourceController: null
    readonly property string verifyKey: requestKey + "-verify-" + generation
    property string documentStatus: ""
    property string requestKey: "property-asset-" + String(root)
    property int generation: 0
    readonly property string listKey: requestKey + "-list-" + generation
    readonly property string uploadKey: requestKey + "-upload-" + generation
    property bool previewReady: true
    property bool multipleFiles: false
    // A media list shows one click-or-drop zone instead of the library controls
    // (web components/properties/ImageListProperty.tsx and its audio, video and text siblings).
    // The card drop zone and the Library replace an image, video or audio
    // asset, so those kinds show no picker list.
    property bool dropZoneOnly: mediaKind === "image" || mediaKind === "video" || mediaKind === "audio"
    readonly property string dropPrompt: mediaKind === "image" ? qsTr("Click or drop images here")
        : mediaKind === "audio" ? qsTr("Click or drop audio files here")
        : mediaKind === "video" ? qsTr("Click or drop videos here")
        : mediaKind === "text" ? qsTr("Click or drop text files here") : qsTr("Click or drop files here")
    readonly property string dropTooltip: mediaKind === "image" ? qsTr("Click to select images or drag and drop")
        : mediaKind === "audio" ? qsTr("Click to select audio files or drag and drop")
        : mediaKind === "video" ? qsTr("Click to select videos or drag and drop")
        : mediaKind === "text" ? qsTr("Click to select text files or drag and drop") : qsTr("Click to select files or drag and drop")
    function chooseFiles() {
        if (!writable || !controller || uploading) return
        editNodeId = nodeId
        if (dialogProvider) {
            const chosen = dialogProvider(mediaKind, picker.nameFilters)
            uploadFiles(Array.isArray(chosen) ? chosen : [chosen])
        } else {
            picker.open()
        }
    }
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
        if (resolver) {
            resolver.cancel(documentKey)
            resolver.release(documentKey)
        }
        if (controller) {
            controller.cancel(documentKey)
        }
        documentAsset = ({})
        documentUrl = ""
        documentText = ""
        if (resourceController && mediaKind === "document") {
            resourceController.cancel(verifyKey)
            documentStatus = ""
        }
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
    function verifyDocument() {
        if (mediaKind !== "document") {
            return
        }
        if (resourceController) {
            resourceController.cancel(verifyKey)
        }
        documentStatus = ""
        if (controller) {
            controller.cancel(documentKey)
        }
        if (resolver) {
            resolver.cancel(documentKey)
            resolver.release(documentKey)
        }
        documentAsset = ({})
        documentUrl = ""
        documentText = ""
        if (value && resolver) {
            resolver.resolve(documentKey, value)
        }
        if (value && value.asset_id) {
            if (controller) {
                controller.describe(documentKey, value.asset_id)
            }
            if (resourceController) {
                resourceController.verifyAsset(verifyKey, value.asset_id)
            }
        }
    }
    Connections {
        target: root.resolver
        function onResolved(key, url) {
            if (key !== root.documentKey) return
            root.documentUrl = url
            if (/\.(txt|html)$/i.test(url.toString())) {
                root.documentText = root.resolver.resolvedText(key)
            }
        }
    }
    onValueChanged: verifyDocument()
    Component.onCompleted: verifyDocument()
    Connections {
        target: root.resourceController
        function onVerified(key, id, available) {
            if (key === root.verifyKey && root.value && root.value.asset_id === id) {
                root.documentStatus = available ? "" : " · unavailable or deleted"
            }
        }
        function onFailed(key, message) {
            if (key === root.verifyKey) {
                root.documentStatus = " · could not verify"
            }
        }
    }
    onNodeIdChanged: resetScope()
    onMediaKindChanged: resetScope()
    onWritableChanged: if (!writable) resetScope()
    Component.onDestruction: cancelEdit()
    Connections {
        target: root.controller
        function onCleared() { root.resetScope(); root.scopeInvalidated() }
        function onDescribed(key, asset) {
            if (key === root.documentKey) {
                root.documentAsset = asset
            }
        }
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
        visible: ["asset", "document"].includes(root.mediaKind) && root.value !== null && root.value !== undefined
        text: root.value ? String(root.documentAsset.name || root.value.asset_id || root.value.id || root.value.uri || "") + root.documentStatus : "No document selected"
        role: Ui.Typography.SansCaption
        wrapMode: Text.WrapAnywhere
    }
    Ui.Text {
        objectName: "document-text-preview"
        Layout.fillWidth: true
        visible: root.mediaKind === "document" && root.documentText !== ""
        text: root.documentText
        textFormat: Text.PlainText
        wrapMode: Text.WrapAnywhere
        role: Ui.Typography.SansCaption
    }
    NodeButton {
        objectName: "document-open"
        visible: root.mediaKind === "document" && root.documentUrl.toString() !== ""
        text: "Open document"
        onClicked: Qt.openUrlExternally(root.documentUrl)
    }
    Loader {
        Layout.fillWidth: true
        active: root.previewReady && !(["asset", "document"].includes(root.mediaKind)) && root.value !== null && root.value !== undefined
        sourceComponent: Component {
            MediaPreview {
                mediaKind: root.mediaKind
                locator: root.value
                requestKey: root.requestKey + "-preview"
                resolver: root.resolver
            }
        }
    }
    Ui.TextField {
        Layout.fillWidth: true
        visible: !root.dropZoneOnly
        objectName: "asset-search-" + root.descriptor.name
        value: root.searchText
        accessibleName: "Search " + root.mediaKind + " assets"
        placeholderText: "Search existing assets"
        enabled: root.writable && !root.uploading
        onValueCommitted: value => { root.searchText = value; root.search(false) }
    }
    RowLayout {
        visible: !root.dropZoneOnly
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
            onClicked: {
                root.editNodeId = root.nodeId
                if (root.dialogProvider) {
                    root.uploadFile(root.dialogProvider(root.mediaKind, picker.nameFilters))
                } else {
                    picker.open()
                }
            }
        }
    }
    Ui.Select {
        objectName: "asset-select-" + root.descriptor.name
        visible: !root.dropZoneOnly
        Layout.fillWidth: true
        accessibleName: "Select " + root.mediaKind + " asset"
        enabled: root.writable && !root.uploading && root.assets.length > 0
        options: root.assets.map(asset => ({label: asset.name || asset.id, value: asset.id}))
        value: root.value && root.value.asset_id ? root.value.asset_id : ""
        onValueCommitted: value => root.selectAsset(value)
    }
    NodeButton {
        visible: root.nextCursor !== "" && !root.dropZoneOnly
        text: "Load more assets"
        enabled: root.writable && !root.listing
        onClicked: root.search(true)
    }
    RowLayout {
        visible: root.uploading
        Ui.Text { text: "Uploading " + Math.round(root.uploadProgress * 100) + "%"; role: Ui.Typography.SansCaption }
        NodeButton {
            objectName: "asset-cancel-upload"
            text: "Cancel upload"
            onClicked: root.cancelEdit()
        }
    }
    Ui.Text {
        Layout.fillWidth: true
        text: root.dropZoneOnly ? root.error : (root.error || (!root.controller ? "Connect to a server to choose media." : root.listing ? "Loading assets…" : root.assets.length === 0 ? (root.searched ? "No matching assets. Change the search or upload a file." : "Browse your library or upload a file.") : ""))
        visible: text !== ""
        role: Ui.Typography.SansCaption
        tone: root.error ? Ui.Text.Error : Ui.Text.Secondary
        wrapMode: Text.Wrap
    }
    Rectangle {
        id: dropZone
        objectName: "media-list-drop-" + root.descriptor.name
        visible: root.dropZoneOnly
        Layout.fillWidth: true
        implicitHeight: 80
        radius: Ui.Metrics.radiusControl
        readonly property bool over: zoneDrop.containsDrag || zoneHover.hovered || activeFocus
        color: over ? Ui.Theme.actionSelected : Ui.Theme.surfaceInput
        border.width: activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
        border.color: activeFocus ? Ui.Theme.borderFocus : over ? Ui.Theme.textSecondary : Ui.Theme.borderSubtle
        opacity: root.writable && root.controller ? 1 : 0.6
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: root.dropTooltip
        Accessible.onPressAction: root.chooseFiles()
        Keys.onReturnPressed: root.chooseFiles()
        Keys.onSpacePressed: root.chooseFiles()
        HoverHandler {
            id: zoneHover
            onHoveredChanged: root.toolTipRequested(hovered ? root.dropTooltip : "")
        }
        TapHandler { onTapped: root.chooseFiles() }
        Ui.Text {
            anchors.centerIn: parent
            width: parent.width - Ui.Metrics.xl * 2
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            text: root.dropPrompt
            font.capitalization: Font.AllUppercase
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        DropArea {
            id: zoneDrop
            anchors.fill: parent
            enabled: root.writable && root.controller && !root.uploading
            onDropped: drop => { if (drop.hasUrls) { root.uploadFiles(drop.urls); drop.acceptProposedAction() } }
        }
    }
    DropArea {
        objectName: "asset-drop-" + root.descriptor.name
        visible: !root.dropZoneOnly
        Layout.fillWidth: true
        implicitHeight: Ui.Metrics.touch
        enabled: root.writable && root.controller && !root.uploading
        onDropped: drop => { if (drop.hasUrls && (root.multipleFiles || drop.urls.length === 1)) { root.uploadFiles(drop.urls); drop.acceptProposedAction() } }
        Ui.Text { anchors.centerIn: parent; text: "Drop an " + root.mediaKind + " file"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
    }
    Timer { id: previewRestart; interval: 0; onTriggered: root.previewReady = true }
    FileDialog {
        id: picker
        parentWindow: root.Window.window
        title: "Upload " + root.mediaKind
        fileMode: root.multipleFiles ? FileDialog.OpenFiles : FileDialog.OpenFile
        nameFilters: root.mediaKind === "image" ? ["Images (*.png *.jpg *.jpeg *.webp *.gif *.bmp *.svg)"]
            : root.mediaKind === "audio" ? ["Audio (*.wav *.mp3 *.flac *.ogg *.m4a *.aac)"] : root.mediaKind === "video" ? ["Video (*.mp4 *.webm *.mov *.mkv *.avi *.wmv *.flv)"] : root.mediaKind === "document" ? ["Documents (*.pdf *.doc *.docx *.txt *.html)"] : ["All files (*)"]
        onAccepted: if (root.writable && root.editNodeId === root.nodeId) root.uploadFiles(root.multipleFiles ? selectedFiles : [selectedFile])
    }
}

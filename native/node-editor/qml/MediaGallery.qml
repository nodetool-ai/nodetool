import QtQuick
import QtQuick.Window
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import QtQuick.Dialogs
import QtCore
import NodeTool.NodeEditor.Media 1.0
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    property var items: []
    property bool compact: false
    // A Preview card offers Save to assets for every media kind, as the web PreviewActions do.
    property bool previewCard: false
    property bool active: true
    property real retainedHeight: Ui.Metrics.comfortable * 6
    readonly property real preferredHeight: active ? implicitHeight : retainedHeight
    onImplicitHeightChanged: if (active && implicitHeight > 0) retainedHeight = implicitHeight
    property string scopeKey: "gallery-" + String(root)
    property string notice: ""
    // The tab's MediaResolver, which reads every gallery item.
    property var resolver: null
    readonly property var selected: gallery.selected
    readonly property int count: gallery.count
    readonly property int currentIndex: gallery.currentIndex
    readonly property bool singleView: gallery.singleView
    // Web PreviewImageGrid: Select mode, checked tiles, and the selection's actions.
    property bool selectionMode: false
    property var selectedKeys: []
    property var compareItems: []
    property string batchStatus: ""
    property var batchPending: ({})
    property int batchSaved: 0
    property int batchFailed: 0
    property url batchFolder
    readonly property bool canSelect: root.items.length >= 2
    readonly property var selectedItems: root.items.filter(item => root.selectedKeys.indexOf(item.itemKey) >= 0)
    readonly property var selectedImages: selectedItems.filter(item => item.kind === "image")
    activeFocusOnTab: true
    spacing: Ui.Metrics.xs
    function selectable(item) { return !!item && item.kind !== "text" && !!item.locator }
    function toggleSelected(index) {
        const item = root.items[index]
        if (!selectable(item)) return
        const keys = root.selectedKeys.slice()
        const at = keys.indexOf(item.itemKey)
        if (at >= 0) keys.splice(at, 1); else keys.push(item.itemKey)
        root.selectedKeys = keys
    }
    function toggleSelectionMode() {
        root.selectionMode = !root.selectionMode
        root.selectedKeys = []
        root.batchStatus = ""
    }
    function clearSelection() { root.selectedKeys = []; root.batchStatus = "" }
    function compareSelected() {
        if (root.selectedImages.length !== 2) return
        root.compareItems = root.selectedImages.slice()
    }
    function closeCompare() { root.compareItems = [] }
    function batchName(item, index) {
        const key = "batch:" + root.scopeKey + ":" + item.itemKey
        const name = root.resolver.suggestedFilename(key, item.filename || "", item.kind)
        return (index + 1) + "-" + (name || (item.kind + "-" + (index + 1)))
    }
    // Each selected item is read through its own resolver key, saved into the folder, then released.
    function downloadSelected(folder) {
        if (!root.resolver) return
        cancelBatch()
        root.batchFolder = folder
        root.batchSaved = 0; root.batchFailed = 0
        const pending = {}
        root.selectedItems.forEach((item, index) => { pending["batch:" + root.scopeKey + ":" + item.itemKey] = {item: item, index: index} })
        root.batchPending = pending
        root.batchStatus = "Saving " + Object.keys(pending).length + " files…"
        for (const key in pending) root.resolver.resolve(key, pending[key].item.locator)
    }
    function cancelBatch() {
        if (root.resolver) for (const key in root.batchPending) { root.resolver.cancel(key); root.resolver.release(key) }
        root.batchPending = ({})
    }
    function finishBatchItem(key, saved) {
        const pending = Object.assign({}, root.batchPending)
        delete pending[key]
        root.batchPending = pending
        if (root.resolver) root.resolver.release(key)
        if (saved) root.batchSaved += 1; else root.batchFailed += 1
        if (Object.keys(pending).length === 0) {
            root.batchStatus = root.batchFailed === 0 ? "Saved " + root.batchSaved + (root.batchSaved === 1 ? " file" : " files")
                : "Saved " + root.batchSaved + ", failed " + root.batchFailed
        }
    }
    onCountChanged: { root.selectedKeys = []; root.selectionMode = false; root.compareItems = []; cancelBatch(); root.batchStatus = "" }
    Component.onDestruction: cancelBatch()
    Connections {
        target: root.resolver
        function onResolved(key, url) {
            const entry = root.batchPending[key]
            if (!entry) return
            const folder = root.batchFolder.toString().replace(/\/$/, "")
            const destination = folder + "/" + root.batchName(entry.item, entry.index)
            root.finishBatchItem(key, root.resolver.saveResolved(key, destination))
        }
        function onFailed(key, message) { if (root.batchPending[key]) root.finishBatchItem(key, false) }
    }
    FolderDialog {
        id: batchDialog
        objectName: "gallery-batch-download-dialog"
        currentFolder: StandardPaths.writableLocation(StandardPaths.DownloadLocation)
        onAccepted: root.downloadSelected(selectedFolder)
    }
    function activate(index) {
        const item = root.items[index]
        gallery.open(index)
        if (item && item.kind === "image") {
            const images = root.items.filter(entry => entry.kind === "image")
            const selectedIndex = images.findIndex(entry => entry.itemKey === item.itemKey)
            imageViewer.transientParent = viewerHost.windowFor(root.Window.window)
            imageViewer.openAt(images, selectedIndex, root)
        }
    }
    onItemsChanged: imageViewer.sync(root.items.filter(item => item.kind === "image"))
    onScopeKeyChanged: imageViewer.dismiss()
    onActiveChanged: if (!active) imageViewer.dismiss()
    MediaViewerHost { id: viewerHost }
    ImageViewer { id: imageViewer; scopeKey: root.scopeKey; resolver: root.resolver }
    function release() {
        imageViewer.dismiss()
        if (viewer.item && viewer.item.reset) viewer.item.reset()
        for (const tile of tiles.contentItem.children) { if (tile.release) tile.release() }
    }
    MediaGalleryModel { id: gallery; items: root.items }
    Ui.Text { Layout.fillWidth: true; visible: root.notice.length > 0; text: root.notice; role: Ui.Typography.SansCaption; wrapMode: Text.WrapAnywhere }
    Flow {
        visible: gallery.singleView && gallery.count > 1
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        Ui.EditorButton { objectName: "gallery-grid"; text: "Grid"; accessibleName: "Show output grid"; visible: gallery.singleView; variant: Ui.EditorButton.Outlined; flat: true; onClicked: gallery.showGrid() }
        Ui.EditorButton { objectName: "gallery-previous"; text: root.compact ? "‹" : "Previous"; accessibleName: "Previous output"; enabled: gallery.currentIndex > 0; variant: Ui.EditorButton.Outlined; flat: true; onClicked: gallery.open(gallery.currentIndex - 1) }
        Ui.Text { objectName: "gallery-position"; height: Ui.Metrics.compact; verticalAlignment: Text.AlignVCenter; text: (gallery.currentIndex + 1) + " / " + gallery.count; role: Ui.Typography.MonoCaption; elide: Text.ElideRight }
        Ui.EditorButton { objectName: "gallery-copy"; text: "Copy"; accessibleName: "Copy selected image"; visible: gallery.singleView && root.selected.kind === "image"; variant: Ui.EditorButton.Outlined; flat: true; onClicked: { if (viewer.item && viewer.item.copyImage) viewer.item.copyImage() } }
        Ui.EditorButton { objectName: "gallery-download"; text: "Download"; accessibleName: "Download selected output"; visible: gallery.singleView && root.selected.kind === "image"; variant: Ui.EditorButton.Outlined; flat: true; onClicked: { if (viewer.item && viewer.item.download) viewer.item.download() } }
        Ui.EditorButton { objectName: "gallery-next"; text: root.compact ? "›" : "Next"; accessibleName: "Next output"; enabled: gallery.currentIndex + 1 < gallery.count; variant: Ui.EditorButton.Outlined; flat: true; onClicked: gallery.open(gallery.currentIndex + 1) }
    }
    Loader {
        id: viewer
        objectName: "gallery-viewer"
        visible: active
        Layout.fillWidth: true
        Layout.fillHeight: root.compact
        active: root.active && gallery.singleView && gallery.count > 0
        sourceComponent: root.selected.kind === "text" ? textView : mediaView
    }
    Component {
        id: mediaView
        MediaPreview {
            id: selectedPreview
            objectName: "gallery-selected-media"
            resolver: root.resolver
            mediaKind: root.selected.kind || "image"
            locator: root.selected.locator || ""
            filename: root.selected.filename || ""
            requestKey: root.scopeKey + ":selected:" + String(selectedPreview)
            fillPreview: root.compact && mediaKind === "image"
            compact: root.compact
            onImageActivated: root.activate(gallery.currentIndex)
            showDownload: mediaKind !== "image" || gallery.count <= 1
            showSaveToAssets: mediaKind === "video" || root.previewCard
            compactPreviewHeight: root.compact && gallery.count > 1 ? Ui.Metrics.comfortable : mediaKind === "audio" ? Ui.Metrics.xxxl * 2 + Ui.Metrics.lg : Ui.Metrics.comfortable * 2
        }
    }
    Component {
        id: textView
        Ui.TextArea {
            objectName: "gallery-selected-text"
            variant: Ui.TextArea.Plain
            role: Ui.Typography.MonoCaption
            accessibleName: "Output item " + (gallery.currentIndex + 1)
            readOnly: true
            textFormat: TextEdit.PlainText
            value: root.selected.text || ""
            wrapMode: TextEdit.WrapAnywhere
        }
    }
    Flow {
        objectName: "gallery-selection-bar"
        visible: !gallery.singleView && root.canSelect && root.compareItems.length === 0
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        NodeButton { objectName: "gallery-select"; text: root.selectionMode ? "Exit select" : "Select"; accessibleName: root.selectionMode ? "Exit selection mode" : "Select outputs"; variant: NodeButton.Flat; onClicked: root.toggleSelectionMode() }
        NodeButton { objectName: "gallery-compare"; visible: root.selectionMode && root.selectedKeys.length > 0; text: "Compare"; accessibleName: "Compare the two selected images"; enabled: root.selectedImages.length === 2 && root.selectedKeys.length === 2; variant: NodeButton.Flat; onClicked: root.compareSelected() }
        NodeButton { objectName: "gallery-download-selected"; visible: root.selectionMode && root.selectedKeys.length > 0; text: "Download"; accessibleName: "Download the selected outputs"; enabled: !!root.resolver && Object.keys(root.batchPending).length === 0; variant: NodeButton.Flat; onClicked: batchDialog.open() }
        NodeButton { objectName: "gallery-clear-selection"; visible: root.selectionMode && root.selectedKeys.length > 0; text: "Clear"; accessibleName: "Clear selection"; variant: NodeButton.Flat; onClicked: root.clearSelection() }
        Ui.Text { objectName: "gallery-selected-count"; visible: root.selectionMode && root.selectedKeys.length > 0; height: Ui.Metrics.compact; verticalAlignment: Text.AlignVCenter; text: root.selectedKeys.length + " selected"; role: Ui.Typography.SansCaption }
        Ui.Text { objectName: "gallery-batch-status"; visible: root.batchStatus.length > 0; height: Ui.Metrics.compact; verticalAlignment: Text.AlignVCenter; text: root.batchStatus; role: Ui.Typography.SansCaption }
    }
    // The web compare dialog, shown in place of the grid.
    ColumnLayout {
        objectName: "gallery-compare-view"
        visible: root.compareItems.length === 2
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        NodeButton { objectName: "gallery-close-compare"; text: "Close comparison"; accessibleName: "Close comparison"; variant: NodeButton.Flat; onClicked: root.closeCompare() }
        Loader {
            Layout.fillWidth: true
            active: root.compareItems.length === 2
            sourceComponent: Component {
                ImageComparisonOutput {
                    resolver: root.resolver
                    comparison: ({image_a: {uri: root.compareItems[0].locator}, image_b: {uri: root.compareItems[1].locator},
                                  label_a: "Image " + (root.items.indexOf(root.compareItems[0]) + 1), label_b: "Image " + (root.items.indexOf(root.compareItems[1]) + 1)})
                }
            }
        }
    }
    Item {
        visible: !gallery.singleView && gallery.count > 0 && root.compareItems.length === 0
        Layout.fillWidth: true
        Layout.fillHeight: root.compact
        Layout.preferredHeight: Ui.Metrics.comfortable * 8
        clip: true
        GridView {
            id: tiles
            objectName: "gallery-grid-scroll"
            anchors.fill: parent
            anchors.leftMargin: gap
            anchors.topMargin: gap
            readonly property real gap: root.compact ? Ui.Metrics.xs : Ui.Metrics.sm
            readonly property real minimumTileWidth: Ui.Metrics.xxxl * (root.compact ? 3 : 4)
            readonly property int columns: Math.max(1, Math.floor(width / (minimumTileWidth + gap)))
            cellWidth: width / columns
            cellHeight: cellWidth
            model: root.active && !gallery.singleView ? gallery.gridModel : null
            cacheBuffer: 0
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar { objectName: "gallery-grid-scrollbar" }
            delegate: Ui.Surface {
                id: tile
                required property int index
                required property var galleryItem
                width: tiles.cellWidth - tiles.gap
                height: width
                objectName: "gallery-tile-" + index
                readonly property bool inViewport: y + height > tiles.contentY && y < tiles.contentY + tiles.height
                function release() { if (thumbnail.item && thumbnail.item.reset) thumbnail.item.reset() }
                variant: Ui.Surface.Input
                clip: true
                Loader {
                    id: thumbnail
                    anchors.fill: parent
                    active: root.active && tile.inViewport && tile.galleryItem.kind === "image"
                    sourceComponent: Component {
                        MediaPreview {
                            mediaKind: "image"
                            locator: tile.galleryItem.locator
                            resolver: root.resolver
                            requestKey: root.scopeKey + ":tile:" + tile.galleryItem.itemKey + ':' + String(tile)
                            showFilename: false
                            showDownload: false
                            fillPreview: true
                        }
                    }
                }
                Ui.Text {
                    anchors.fill: parent
                    anchors.margins: Ui.Metrics.sm
                    visible: tile.galleryItem.kind !== "image"
                    text: tile.galleryItem.kind === "text" ? tile.galleryItem.text : tile.galleryItem.kind === "video" ? "Video " + (tile.index + 1) : "Audio " + (tile.index + 1)
                    textFormat: Text.PlainText
                    role: Ui.Typography.SansCaption
                    wrapMode: Text.WrapAnywhere
                    maximumLineCount: root.compact ? 2 : 4
                    elide: Text.ElideRight
                }
                readonly property bool checked: root.selectedKeys.indexOf(tile.galleryItem.itemKey) >= 0
                readonly property bool checkable: root.selectionMode && root.selectable(tile.galleryItem)
                function press() { if (root.selectionMode) root.toggleSelected(tile.index); else root.activate(tile.index) }
                selected: activeFocus || checked
                MouseArea {
                    anchors.fill: parent
                    onClicked: { tile.forceActiveFocus(Qt.MouseFocusReason); if (root.selectionMode) root.toggleSelected(tile.index) }
                    onDoubleClicked: if (!root.selectionMode) root.activate(tile.index)
                }
                HoverHandler { id: tileHover }
                // Web ImageTile: Copy, Download and Open over a hovered image.
                Row {
                    objectName: "gallery-tile-actions"
                    visible: !root.selectionMode && tile.galleryItem.kind === "image" && (tileHover.hovered || tile.activeFocus) && !!thumbnail.item
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    anchors.margins: Ui.Metrics.xs
                    spacing: Ui.Metrics.xs
                    NodeButton { objectName: "gallery-tile-copy"; iconName: "copy"; accessibleName: "Copy image " + (tile.index + 1); onClicked: if (thumbnail.item) thumbnail.item.copyImage() }
                    NodeButton { objectName: "gallery-tile-download"; iconName: "arrowDownward"; accessibleName: "Download image " + (tile.index + 1); onClicked: if (thumbnail.item) thumbnail.item.download() }
                    NodeButton { objectName: "gallery-tile-open"; iconName: "openInNew"; accessibleName: "Open image " + (tile.index + 1) + " in viewer"; onClicked: root.activate(tile.index) }
                }
                Ui.CheckBox {
                    objectName: "gallery-tile-check"
                    visible: tile.checkable
                    anchors.left: parent.left
                    anchors.top: parent.top
                    anchors.margins: Ui.Metrics.xs
                    checked: tile.checked
                    accessibleName: "Select output " + (tile.index + 1)
                    onCheckedChangedByUser: { root.toggleSelected(tile.index); checked = Qt.binding(() => tile.checked) }
                }
                Accessible.role: root.selectionMode ? Accessible.CheckBox : Accessible.Button
                Accessible.name: (root.selectionMode ? "Select output " : "Open output ") + (index + 1)
                Accessible.checkable: tile.checkable
                Accessible.checked: tile.checked
                Accessible.onPressAction: tile.press()
                activeFocusOnTab: true
                Keys.onReturnPressed: tile.press()
                Keys.onSpacePressed: tile.press()
            }
        }
    }
}

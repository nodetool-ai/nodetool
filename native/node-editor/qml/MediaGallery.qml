import QtQuick
import QtQuick.Window
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
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
    readonly property var selected: gallery.selected
    readonly property int count: gallery.count
    readonly property int currentIndex: gallery.currentIndex
    readonly property bool singleView: gallery.singleView
    activeFocusOnTab: true
    spacing: Ui.Metrics.xs
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
    ImageViewer { id: imageViewer; scopeKey: root.scopeKey }
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
        NodeButton { objectName: "gallery-grid"; text: "Grid"; accessibleName: "Show output grid"; visible: gallery.singleView; variant: NodeButton.Flat; onClicked: gallery.showGrid() }
        NodeButton { objectName: "gallery-previous"; text: root.compact ? "‹" : "Previous"; accessibleName: "Previous output"; enabled: gallery.currentIndex > 0; variant: NodeButton.Flat; onClicked: gallery.open(gallery.currentIndex - 1) }
        Ui.Text { objectName: "gallery-position"; height: Ui.Metrics.compact; verticalAlignment: Text.AlignVCenter; text: (gallery.currentIndex + 1) + " / " + gallery.count; role: Ui.Typography.MonoCaption; elide: Text.ElideRight }
        NodeButton { objectName: "gallery-copy"; text: "Copy"; accessibleName: "Copy selected image"; visible: gallery.singleView && root.selected.kind === "image"; variant: NodeButton.Flat; onClicked: { if (viewer.item && viewer.item.copyImage) viewer.item.copyImage() } }
        NodeButton { objectName: "gallery-download"; text: "Download"; accessibleName: "Download selected output"; visible: gallery.singleView && root.selected.kind === "image"; variant: NodeButton.Flat; onClicked: { if (viewer.item && viewer.item.download) viewer.item.download() } }
        NodeButton { objectName: "gallery-next"; text: root.compact ? "›" : "Next"; accessibleName: "Next output"; enabled: gallery.currentIndex + 1 < gallery.count; variant: NodeButton.Flat; onClicked: gallery.open(gallery.currentIndex + 1) }
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
    Item {
        visible: !gallery.singleView && gallery.count > 0
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
                selected: activeFocus
                clip: true
                Loader {
                    id: thumbnail
                    anchors.fill: parent
                    active: root.active && tile.inViewport && tile.galleryItem.kind === "image"
                    sourceComponent: Component {
                        MediaPreview {
                            mediaKind: "image"
                            locator: tile.galleryItem.locator
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
                MouseArea {
                    anchors.fill: parent
                    onClicked: tile.forceActiveFocus(Qt.MouseFocusReason)
                    onDoubleClicked: root.activate(tile.index)
                }
                Accessible.role: Accessible.Button
                Accessible.name: "Open output " + (index + 1)
                Accessible.onPressAction: root.activate(index)
                activeFocusOnTab: true
                Keys.onReturnPressed: root.activate(index)
                Keys.onSpacePressed: root.activate(index)
            }
        }
    }
}

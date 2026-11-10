import QtQuick
import QtQuick.Controls
import NodeTool.UiPrimitives as Ui

Item {
    id: grid
    required property var browser
    property var scrub: null
    property Component scrubOverlay: null
    property string selectedId: ""
    property var navigateFolder: null
    // A drag leaves the window as an application/x-nodetool-drag asset payload, as on the web.
    property bool externalDrag: false
    signal previewRequested(var asset)
    signal actionsRequested(var asset)
    signal importRequested()
    signal clearFiltersRequested()
    readonly property var selectedAsset: {
        void browser.assetModel.revision
        return browser.assetModel.indexOf(selectedId) >= 0 ? browser.assetModel.get(selectedId) : null
    }
    readonly property bool filtered: browser.searchText !== "" || browser.typeFilter !== "" || browser.tagFilter !== "" || browser.favoritesOnly
    property real tileSize: 84
    // AssetGridContent uses calculateGridDimensions with assetItemSize=2.
    readonly property int itemSpacing: Ui.Metrics.xs
    // The view sits inside a margin of itemSpacing, so columns divide its inner width.
    readonly property real innerWidth: Math.max(0, width - 2 * itemSpacing)
    readonly property int columns: Math.max(1, Math.min(100, Math.floor((innerWidth + itemSpacing) / (tileSize + itemSpacing))))
    readonly property real itemSize: Math.min(Math.floor(innerWidth / columns - itemSpacing), tileSize * 1.1)
    GridReflow { id: reflow; columns: grid.columns; enabled: tiles.count > 0 }

    GridView {
        id: tiles
        anchors.fill: parent
        anchors.margins: grid.itemSpacing
        clip: true
        cellWidth: grid.innerWidth / grid.columns
        cellHeight: grid.itemSize + grid.itemSpacing
        model: grid.browser.assetModel
        // A reused tile would glide in from the cell of its previous asset.
        reuseItems: !reflow.active
        // Two rows build ahead of the scroll, so tiles exist before they enter.
        cacheBuffer: Math.ceil(2 * cellHeight)
        pixelAligned: true
        ScrollBar.vertical: Ui.ScrollBar {}
        // Tiles move under a resting pointer, which sends no hover of its own.
        onContentYChanged: if (grid.scrub) grid.scrub.clear()
        delegate: AssetItem {
            browser: grid.browser
            externalDrag: grid.externalDrag
            scrub: grid.scrub
            scrubOverlay: grid.scrubOverlay
            navigateFolder: grid.navigateFolder
            width: grid.itemSize
            height: grid.itemSize
            selected: grid.selectedId === asset.id
            onSelectedByUser: grid.selectedId = asset.id
            onPreviewRequested: grid.previewRequested(asset)
            onActionsRequested: grid.actionsRequested(asset)
            id: tile
            transform: glide.shift
            GridGlide { id: glide; target: tile; active: reflow.active }
            GridView.onReused: glide.reset()
            // A pooled tile waits for another asset, so it drops this one's scrub and drag.
            GridView.onPooled: { if (grid.scrub) grid.scrub.leave(asset.id || ""); cancelDrag(); resetForReuse() }
        }
    }
    Column {
        anchors.centerIn: parent
        width: parent.width - 2 * Ui.Metrics.lg
        visible: tiles.count === 0 && !grid.browser.busy && grid.browser.configured
        spacing: Ui.Metrics.md
        Ui.Text {
            width: parent.width
            text: grid.filtered ? "No matching assets" : "This folder is empty"
            horizontalAlignment: Text.AlignHCenter
            role: Ui.Typography.SansLabel
        }
        Ui.Text {
            width: parent.width
            text: grid.filtered ? "No assets match the current Library filters. Clear filters or choose another folder." : "Drop files here or use Import to add assets."
            wrapMode: Text.WordWrap
            horizontalAlignment: Text.AlignHCenter
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        Ui.EditorButton {
            anchors.horizontalCenter: parent.horizontalCenter
            density: Ui.EditorButton.Compact
            text: grid.filtered ? "Clear filters" : "Import assets"
            accessibleName: text
            onClicked: { if (grid.filtered) grid.clearFiltersRequested(); else grid.importRequested() }
        }
    }
}

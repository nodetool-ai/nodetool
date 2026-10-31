import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: grid
    required property AssetBrowser browser
    property string selectedId: ""
    property var navigateFolder: null
    signal previewRequested(var asset)
    signal actionsRequested(var asset)
    signal importRequested()
    signal clearFiltersRequested()
    readonly property var selectedAsset: {
        const rows = browser.assets
        for (let i = 0; i < rows.length; ++i) if (rows[i].id === selectedId) return rows[i]
        return null
    }
    readonly property bool filtered: browser.searchText !== "" || browser.typeFilter !== "" || browser.tagFilter !== "" || browser.favoritesOnly
    // AssetGridContent uses calculateGridDimensions with assetItemSize=2.
    readonly property int itemSpacing: Ui.Metrics.xs
    readonly property int columns: Math.max(1, Math.min(100, Math.floor((width + itemSpacing) / (84 + itemSpacing))))
    readonly property real itemSize: Math.min(Math.floor((width - itemSpacing * (columns + 1)) / columns), 84 * 1.1)

    GridView {
        id: tiles
        anchors.fill: parent
        anchors.margins: grid.itemSpacing
        clip: true
        cellWidth: (grid.width - grid.itemSpacing) / grid.columns
        cellHeight: grid.itemSize + grid.itemSpacing
        model: grid.browser.assets
        ScrollBar.vertical: Ui.ScrollBar {}
        delegate: AssetItem {
            required property var modelData
            asset: modelData
            browser: grid.browser
            navigateFolder: grid.navigateFolder
            width: grid.itemSize
            height: grid.itemSize
            selected: grid.selectedId === asset.id
            onSelectedByUser: grid.selectedId = asset.id
            onPreviewRequested: grid.previewRequested(asset)
            onActionsRequested: grid.actionsRequested(asset)
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
        LibraryButton {
            anchors.horizontalCenter: parent.horizontalCenter
            text: grid.filtered ? "Clear filters" : "Import assets"
            onClicked: { if (grid.filtered) grid.clearFiltersRequested(); else grid.importRequested() }
        }
    }
}

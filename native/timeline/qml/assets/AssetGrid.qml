import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

Item {
    id: grid
    required property AssetBrowser browser
    property string selectedId: ""
    // AssetGridContent uses calculateGridDimensions with assetItemSize=2.
    readonly property int itemSpacing: 5
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
        ScrollBar.vertical: ScrollBar {}
        delegate: AssetItem {
            required property var modelData
            asset: modelData
            browser: grid.browser
            width: grid.itemSize
            height: grid.itemSize
            selected: grid.selectedId === asset.id
            onSelectedByUser: grid.selectedId = asset.id
        }
    }
    Column {
        anchors.centerIn: parent
        width: parent.width - 2 * Theme.spacingLg
        visible: tiles.count === 0 && !grid.browser.busy && grid.browser.configured
        spacing: Theme.spacingMd
        Text {
            width: parent.width
            text: "This folder is empty"
            horizontalAlignment: Text.AlignHCenter
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
        }
        Text {
            width: parent.width
            text: "Drop files here or use the upload button to add assets"
            wrapMode: Text.WordWrap
            horizontalAlignment: Text.AlignHCenter
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
        }
    }
}

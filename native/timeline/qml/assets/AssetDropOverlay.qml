import QtQuick
import NodeTool.Timeline
import "AssetContext.js" as Context

Item {
    id: overlay
    objectName: "assetDropOverlay"
    property var region: null
    property var explorer: null
    readonly property var browser: explorer ? explorer.browser : null
    property string warning: ""
    Component.onCompleted: Qt.callLater(() => {
        const editor = Context.editorFor(overlay)
        overlay.region = Context.itemNamed(editor, "tracksRegion")
        overlay.explorer = Context.itemNamed(editor, "assetExplorer")
    })
    // Coordinates are local to the lanes viewport, matching TrackLane's
    // content-space pointer after applying the view's horizontal scroll.
    function dropAt(asset, x, y) {
        if (!region || !browser) return false
        const view = region.viewState
        const trackId = browser.trackAt(region.rows, y + view.scrollTopPx)
        const startMs = Math.max(0, Math.round((x + view.scrollLeftPx) * view.msPerPx))
        return browser.drop(asset, trackId, startMs, region.gestures.dropMode, 24 * view.msPerPx)
    }
    DropArea {
        id: assetDrop
        objectName: "assetLaneDropArea"
        // Reading the editor dimensions also invalidates this mapping when
        // an ancestor layout moves the region on resize.
        readonly property point origin: {
            const extent = overlay.width + overlay.height
            return overlay.region && extent >= 0
                ? overlay.region.mapToItem(overlay, overlay.region.headerWidth, Theme.toolbarHeight + Theme.rulerHeight)
                : Qt.point(0, 0)
        }
        x: origin.x
        y: origin.y
        width: overlay.region ? overlay.region.width - overlay.region.headerWidth : 0
        height: overlay.region ? overlay.region.lanesHeight : 0
        keys: ["application/x-nodetool-asset"]
        onDropped: drop => {
            if (!drop.source || !drop.source.asset || Array.isArray(drop.source.asset)) {
                overlay.warning = "Drop one asset at a time onto a track."
                dismiss.restart()
                return
            }
            overlay.warning = ""
            if (overlay.dropAt(drop.source.asset, drop.x, drop.y)) drop.acceptProposedAction()
        }
        Rectangle {
            anchors.fill: parent
            visible: assetDrop.containsDrag
            color: Theme.actionSelected
            border.color: Theme.primary
            border.width: 1
        }
    }
    Timer { id: dismiss; interval: 3000; onTriggered: overlay.warning = "" }
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        y: assetDrop.y
        text: overlay.warning
        visible: text !== ""
        color: Theme.warning
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
    }
}

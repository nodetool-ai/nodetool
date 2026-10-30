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
    function trackAt(y) {
        if (!region || !browser || y >= region.lanesHeight - Theme.toolbarHeight) return ""
        return browser.trackAt(region.rows, y + region.viewState.scrollTopPx)
    }
    function dropAt(asset, x, y) {
        if (!region || !browser) return false
        const view = region.viewState
        const trackId = trackAt(y)
        const startMs = Math.max(0, Math.round((x + view.scrollLeftPx) * view.msPerPx))
        return browser.drop(asset, trackId, startMs, region.gestures.dropMode, 24 * view.msPerPx)
    }
    DropArea {
        id: assetDrop
        objectName: "assetLaneDropArea"
        parent: overlay.region || overlay
        x: overlay.region ? overlay.region.headerWidth : 0
        y: Theme.toolbarHeight + Theme.rulerHeight
        width: overlay.region ? overlay.region.width - overlay.region.headerWidth : 0
        height: overlay.region ? overlay.region.lanesHeight : 0
        keys: ["application/x-nodetool-asset"]
        readonly property string targetTrackId: overlay.trackAt(drag.y)
        readonly property bool dropAllowed: !!overlay.browser && !!drag.source
            && overlay.browser.canDrop(drag.source.asset || {}, targetTrackId)
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
            Rectangle {
                visible: assetDrop.targetTrackId !== ""
                anchors.horizontalCenter: parent.horizontalCenter
                y: Math.max(Theme.spacingSm, Math.min(parent.height - height - Theme.spacingSm, assetDrop.drag.y + Theme.spacingSm))
                width: hint.implicitWidth + 2 * Theme.spacingMd
                height: hint.implicitHeight + 2 * Theme.spacingSm
                radius: Theme.radiusSm
                color: Theme.backgroundPaper
                Text {
                    id: hint
                    anchors.centerIn: parent
                    text: "Drop onto this track"
                    color: Theme.textPrimary
                    font.family: Theme.sansFamily
                    font.pixelSize: Theme.fontSizeSmall
                }
            }
            Rectangle {
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                height: Theme.toolbarHeight
                color: assetDrop.targetTrackId === "" ? Theme.actionSelected : Theme.backgroundPaper
                border.color: Theme.primary
                border.width: 1
                Text {
                    anchors.centerIn: parent
                    text: "Drop here to create a track"
                    color: Theme.textPrimary
                    font.family: Theme.sansFamily
                    font.pixelSize: Theme.fontSizeSmall
                }
            }
        }
    }
    Timer { id: dismiss; interval: 3000; onTriggered: overlay.warning = "" }
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        y: overlay.region ? overlay.region.mapToItem(overlay, 0, assetDrop.y).y : 0
        text: overlay.warning
        visible: text !== ""
        color: Theme.warning
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
    }
}

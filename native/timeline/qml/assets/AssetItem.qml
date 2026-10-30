import QtQuick
import NodeTool.Timeline

Rectangle {
    id: tile
    required property var asset
    required property AssetBrowser browser
    property var navigateFolder: null
    function openFolder() {
        if (navigateFolder) navigateFolder(asset.id)
        else browser.openFolder(asset.id)
    }
    property bool selected: false
    signal selectedByUser()
    signal previewRequested()
    signal actionsRequested()
    readonly property string mediaType: browser.mediaType(asset)
    readonly property bool isFolder: asset.content_type === "folder"
    readonly property string poster: asset.thumb_url || (mediaType === "image" ? asset.get_url || "" : "")
    readonly property bool showCaption: true
    color: Theme.backgroundPaper
    border.width: selected || activeFocus ? 2 : 1
    border.color: selected || activeFocus ? Theme.primary : Theme.divider
    radius: Theme.radiusSm
    clip: true
    activeFocusOnTab: true
    Accessible.role: Accessible.Button
    Accessible.name: asset.name || "Asset"
    Keys.onSpacePressed: { selectedByUser(); if (!isFolder) previewRequested() }
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Menu || (event.key === Qt.Key_F10 && event.modifiers === Qt.ShiftModifier)) {
            actionsRequested()
            event.accepted = true
        }
    }
    Keys.onReturnPressed: {
        if (isFolder) openFolder()
        else { selectedByUser(); previewRequested() }
    }
    Keys.onEnterPressed: {
        if (isFolder) openFolder()
        else { selectedByUser(); previewRequested() }
    }

    Image {
        id: posterImage
        anchors.fill: parent
        anchors.margins: 1
        source: tile.browser.mediaUrl(tile.poster)
        asynchronous: true
        fillMode: Image.PreserveAspectCrop
        sourceSize: Qt.size(tile.width * 2, tile.height * 2)
        visible: status === Image.Ready
    }
    Icon {
        anchors.centerIn: parent
        visible: !posterImage.visible
        size: Theme.iconSm * 2
        path: tile.mediaType === "audio" ? Icons.audiotrack : tile.mediaType === "video" ? Icons.videocam : Icons.layers
        color: Theme.clipAccent(tile.mediaType)
    }
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: caption.height + 2 * Theme.spacingSm
        color: Theme.scrim
        visible: tile.showCaption
        Column {
            id: caption
            x: Theme.spacingSm
            y: Theme.spacingSm
            width: parent.width - 2 * Theme.spacingSm
            spacing: Theme.spacingMicro
            Text {
                width: parent.width
                text: tile.asset.name || ""
                maximumLineCount: 2
                wrapMode: Text.WrapAnywhere
                elide: Text.ElideRight
                color: Theme.textPrimary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Font.Medium
            }
            Text {
                visible: !!tile.asset.duration
                text: {
                    const seconds = Math.floor(tile.asset.duration || 0)
                    const pad = n => String(n).padStart(2, "0")
                    return pad(Math.floor(seconds / 3600)) + ":" + pad(Math.floor(seconds / 60) % 60) + ":" + pad(seconds % 60)
                }
                color: Theme.textSecondary
                font.family: Theme.monoFamily
                font.pixelSize: Theme.fontSizeSmaller
            }
        }
    }
    HoverHandler { id: hover; cursorShape: Qt.OpenHandCursor }
    Item {
        id: dragPoint
        width: 1
        height: 1
        Drag.active: !tile.isFolder && mouse.drag.active
        Drag.keys: ["application/x-nodetool-asset"]
        Drag.source: tile
        Drag.supportedActions: Qt.CopyAction
    }
    MouseArea {
        id: mouse
        anchors.fill: parent
        drag.target: tile.isFolder ? null : dragPoint
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onDoubleClicked: { if (tile.isFolder) tile.openFolder(); else tile.previewRequested() }
        onPressed: event => {
            tile.forceActiveFocus()
            tile.selectedByUser()
            if (event.button === Qt.RightButton) tile.actionsRequested()
            dragPoint.x = event.x
            dragPoint.y = event.y
        }
        onReleased: dragPoint.Drag.drop()
        onCanceled: dragPoint.Drag.cancel()
    }
}

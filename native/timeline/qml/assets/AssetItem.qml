import QtQuick
import QtQuick.Window
import NodeTool.Timeline

Rectangle {
    id: tile
    objectName: "libraryAsset_" + (asset.id || "")
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
    readonly property bool dragging: dragPoint.Drag.active
    readonly property bool dropAllowed: !!dragPoint.Drag.target && dragPoint.Drag.target.dropAllowed !== false
    readonly property int dragAction: dragPoint.Drag.target && dragPoint.Drag.target.dropAction === Qt.MoveAction ? Qt.MoveAction : Qt.CopyAction
    readonly property bool folderDropActive: folderDrop.containsDrag && folderDrop.dropAllowed
    color: folderDropActive ? Theme.actionSelected : Theme.backgroundPaper
    border.width: selected || activeFocus || folderDropActive ? 2 : 1
    border.color: selected || activeFocus || folderDropActive ? Theme.primary : Theme.divider
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
    HoverHandler { id: hover; cursorShape: mouse.cursorShape }
    Loader {
        parent: tile.Window.window ? tile.Window.window.contentItem : tile
        anchors.fill: parent
        active: tile.dragging
        visible: active
        z: parent ? parent.children.length : 0
        sourceComponent: Item {
            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.NoButton
                hoverEnabled: true
                cursorShape: mouse.cursorShape
            }
            Rectangle {
                id: dragPreview
                objectName: "assetDragPreview"
                readonly property point pointer: tile.mapToItem(parent, mouse.mouseX, mouse.mouseY)
                x: Math.max(Theme.spacingSm, Math.min(pointer.x + Theme.spacingMd, parent.width - width - Theme.spacingSm))
                y: Math.max(Theme.spacingSm, Math.min(pointer.y + Theme.spacingMd, parent.height - height - Theme.spacingSm))
                width: Theme.toolbarHeight * 3
                height: Theme.toolbarHeight * 2
                color: Theme.backgroundPaper
                border.width: 1
                border.color: tile.dropAllowed ? Theme.primary : Theme.error
                radius: Theme.radiusSm
                clip: true
                Image {
                    id: dragImage
                    objectName: "assetDragImage"
                    anchors.fill: parent
                    anchors.margins: 1
                    source: tile.browser.mediaUrl(tile.poster)
                    asynchronous: true
                    sourceSize: Qt.size(dragPreview.width * 2, dragPreview.height * 2)
                    fillMode: Image.PreserveAspectCrop
                }
                Icon {
                    anchors.centerIn: parent
                    visible: dragImage.status !== Image.Ready
                    size: Theme.iconSm * 2
                    path: tile.mediaType === "audio" ? Icons.audiotrack : tile.mediaType === "video" ? Icons.videocam : Icons.layers
                    color: Theme.clipAccent(tile.mediaType)
                }
                Rectangle {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    height: dragName.implicitHeight + 2 * Theme.spacingSm
                    color: Theme.scrim
                    Text {
                        id: dragName
                        anchors.fill: parent
                        anchors.margins: Theme.spacingSm
                        text: tile.asset.name || "Asset"
                        elide: Text.ElideRight
                        color: Theme.textPrimary
                        font.family: Theme.sansFamily
                        font.pixelSize: Theme.fontSizeSmall
                    }
                }
                Icon {
                    objectName: "assetDragStatus"
                    anchors.top: parent.top
                    anchors.right: parent.right
                    anchors.margins: Theme.spacingSm
                    size: Theme.iconSm
                    path: tile.dropAllowed ? (tile.dragAction === Qt.MoveAction ? Icons.keyboardTab : Icons.add) : Icons.close
                    color: tile.dropAllowed ? Theme.success : Theme.error
                }
            }
        }
    }
    Item {
        id: dragPoint
        width: 1
        height: 1
        Drag.active: !tile.isFolder && mouse.drag.active
        Drag.keys: ["application/x-nodetool-asset"]
        Drag.source: tile
        Drag.supportedActions: Qt.CopyAction | Qt.MoveAction
        Drag.proposedAction: Qt.CopyAction
    }
    MouseArea {
        id: mouse
        objectName: "assetDragPointer"
        anchors.fill: parent
        drag.target: tile.isFolder ? null : dragPoint
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: tile.dragging ? (tile.dropAllowed ? (tile.dragAction === Qt.MoveAction ? Qt.DragMoveCursor : Qt.DragCopyCursor) : Qt.ForbiddenCursor) : Qt.OpenHandCursor
        onDoubleClicked: { if (tile.isFolder) tile.openFolder(); else tile.previewRequested() }
        onPressed: event => {
            tile.forceActiveFocus()
            tile.selectedByUser()
            if (event.button === Qt.RightButton) tile.actionsRequested()
            dragPoint.x = event.x
            dragPoint.y = event.y
        }
        onPositionChanged: event => {
            if (!drag.active) return
            dragPoint.x = event.x
            dragPoint.y = event.y
        }
        onReleased: event => {
            dragPoint.x = event.x
            dragPoint.y = event.y
            dragPoint.Drag.drop()
        }
        onCanceled: dragPoint.Drag.cancel()
    }
    DropArea {
        id: folderDrop
        objectName: "assetFolderDrop_" + (tile.asset.id || "")
        anchors.fill: parent
        enabled: tile.isFolder && tile.browser.configured && !tile.browser.busy
        keys: ["application/x-nodetool-asset"]
        readonly property int dropAction: Qt.MoveAction
        function acceptsSource(source) {
            return !!source && source !== tile && !!source.asset && !!source.asset.id
                && source.asset.content_type !== "folder" && source.asset.parent_id !== tile.asset.id
        }
        readonly property bool dropAllowed: acceptsSource(drag.source)
        onDropped: drop => {
            if (!acceptsSource(drop.source)) return
            const id = drop.source.asset.id
            drop.accept(Qt.MoveAction)
            tile.browser.moveAsset(id, tile.asset.id)
        }
    }
}

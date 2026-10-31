import QtQuick
import QtQuick.Window
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

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
    color: folderDropActive ? Ui.Theme.actionSelected : Ui.Theme.surfacePanel
    border.width: selected || activeFocus || folderDropActive ? Ui.Metrics.focus : Ui.Metrics.border
    border.color: selected || activeFocus || folderDropActive ? Ui.Theme.accentPrimary : Ui.Theme.borderSubtle
    radius: Ui.Metrics.radiusControl
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
        anchors.margins: Ui.Metrics.border
        source: tile.browser.mediaUrl(tile.poster)
        asynchronous: true
        fillMode: Image.PreserveAspectCrop
        sourceSize: Qt.size(tile.width * 2, tile.height * 2)
        visible: status === Image.Ready
    }
    Ui.Icon {
        anchors.centerIn: parent
        visible: !posterImage.visible
        size: Ui.Metrics.iconLg
        name: tile.mediaType === "audio" ? "audiotrack" : tile.mediaType === "video" ? "videocam" : "layers"
        domainColor: TimelineVisuals.clipAccent(tile.mediaType)
    }
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: caption.height + 2 * Ui.Metrics.sm
        color: Ui.Theme.scrimMedia
        visible: tile.showCaption
        Column {
            id: caption
            x: Ui.Metrics.sm
            y: Ui.Metrics.sm
            width: parent.width - 2 * Ui.Metrics.sm
            spacing: Ui.Metrics.micro
            Ui.Text {
                width: parent.width
                text: tile.asset.name || ""
                maximumLineCount: 2
                wrapMode: Text.WrapAnywhere
                elide: Text.ElideRight
                role: Ui.Typography.SansLabel
                tone: Ui.Text.OnAccent
            }
            Ui.Text {
                visible: !!tile.asset.duration
                text: {
                    const seconds = Math.floor(tile.asset.duration || 0)
                    const pad = n => String(n).padStart(2, "0")
                    return pad(Math.floor(seconds / 3600)) + ":" + pad(Math.floor(seconds / 60) % 60) + ":" + pad(seconds % 60)
                }
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.OnAccent
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
                x: Math.max(Ui.Metrics.sm, Math.min(pointer.x + Ui.Metrics.md, parent.width - width - Ui.Metrics.sm))
                y: Math.max(Ui.Metrics.sm, Math.min(pointer.y + Ui.Metrics.md, parent.height - height - Ui.Metrics.sm))
                width: Ui.Metrics.comfortable * 3
                height: Ui.Metrics.comfortable * 2
                color: Ui.Theme.surfacePanel
                border.width: Ui.Metrics.border
                border.color: tile.dropAllowed ? Ui.Theme.accentPrimary : Ui.Theme.statusError
                radius: Ui.Metrics.radiusControl
                clip: true
                Image {
                    id: dragImage
                    objectName: "assetDragImage"
                    anchors.fill: parent
                    anchors.margins: Ui.Metrics.border
                    source: tile.browser.mediaUrl(tile.poster)
                    asynchronous: true
                    sourceSize: Qt.size(dragPreview.width * 2, dragPreview.height * 2)
                    fillMode: Image.PreserveAspectCrop
                }
                Ui.Icon {
                    anchors.centerIn: parent
                    visible: dragImage.status !== Image.Ready
                    size: Ui.Metrics.iconLg
                    name: tile.mediaType === "audio" ? "audiotrack" : tile.mediaType === "video" ? "videocam" : "layers"
                    domainColor: TimelineVisuals.clipAccent(tile.mediaType)
                }
                Rectangle {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    height: dragName.implicitHeight + 2 * Ui.Metrics.sm
                    color: Ui.Theme.scrimMedia
                    Ui.Text {
                        id: dragName
                        anchors.fill: parent
                        anchors.margins: Ui.Metrics.sm
                        text: tile.asset.name || "Asset"
                        elide: Text.ElideRight
                        role: Ui.Typography.SansLabel
                        tone: Ui.Text.OnAccent
                    }
                }
                Ui.Icon {
                    objectName: "assetDragStatus"
                    anchors.top: parent.top
                    anchors.right: parent.right
                    anchors.margins: Ui.Metrics.sm
                    size: Ui.Metrics.iconSm
                    name: tile.dropAllowed ? (tile.dragAction === Qt.MoveAction ? "keyboardTab" : "add") : "close"
                    tone: tile.dropAllowed ? Ui.Text.Success : Ui.Text.Error
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

import QtQuick
import QtQuick.Window
import NodeTool.UiPrimitives as Ui
import "AssetContext.js" as Context

Rectangle {
    id: tile
    objectName: "libraryAsset_" + (asset.id || "")
    required property var asset
    required property var browser
    property var scrub: null
    property Component scrubOverlay: null
    property var navigateFolder: null
    function openFolder() {
        if (navigateFolder) navigateFolder(asset.id)
        else browser.openFolder(asset.id)
    }
    property bool selected: false
    property bool externalDrag: false
    function cancelDrag() { dragPoint.Drag.cancel() }
    signal selectedByUser()
    signal previewRequested()
    signal actionsRequested()
    readonly property string mediaType: browser.mediaType(asset)
    readonly property bool isFolder: asset.content_type === "folder"
    readonly property string poster: asset.thumb_url || (mediaType === "image" ? asset.get_url || "" : "")
    readonly property bool showCaption: hover.hovered || activeFocus
    // The pointer scrubs this video tile (the Library hover scrub).
    readonly property bool scrubbing: mediaType === "video" && !!tile.scrub && tile.scrub.enabled && tile.scrub.hoveredId === (asset.id || "-")
    function scrubTo(x) {
        if (mediaType === "video" && !isFolder && width > 0 && !dragging && tile.scrub) tile.scrub.hover(asset, x / width)
    }
    readonly property bool dragging: dragPoint.Drag.active
    readonly property bool dropAllowed: !!dragPoint.Drag.target && dragPoint.Drag.target.dropAllowed !== false
    readonly property int dragAction: dragPoint.Drag.target && dragPoint.Drag.target.dropAction === Qt.MoveAction ? Qt.MoveAction : Qt.CopyAction
    readonly property bool folderDropActive: folderDrop.containsDrag && folderDrop.dropAllowed
    color: folderDropActive ? Ui.Theme.actionSelected : Ui.Theme.surfacePanel
    border.width: selected || activeFocus || folderDropActive ? Ui.Metrics.focus : Ui.Metrics.border
    border.color: selected || activeFocus || folderDropActive ? Ui.Theme.accentPrimary : Ui.Theme.borderSubtle
    radius: Ui.Metrics.radiusControl
    Behavior on border.color {
        enabled: !Ui.Theme.reducedMotion
        ColorAnimation { duration: Ui.Metrics.motionQuick }
    }
    // A pooled tile shows its next asset without the last fade.
    function resetForReuse() { posterImage.fadeIn = false }
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

    Rectangle {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.border
        radius: Math.max(0, Ui.Metrics.radiusControl - Ui.Metrics.border)
        color: Ui.Theme.surfaceOverlay
        visible: tile.poster !== "" && posterImage.opacity < 1
    }
    Image {
        id: posterImage
        objectName: "assetPosterImage"
        // A cached pixmap is Ready with no Loading step, so it shows at once.
        property bool fadeIn: false
        anchors.fill: parent
        anchors.margins: Ui.Metrics.border
        source: tile.browser.mediaUrl(tile.poster)
        asynchronous: true
        fillMode: Image.PreserveAspectCrop
        sourceSize: Context.thumbSize(tile.width, tile.height, Screen.devicePixelRatio)
        // A resize that crosses a size bucket decodes again. The picture stays
        // on screen meanwhile, and only a new source fades in.
        property bool loaded: false
        retainWhileLoading: true
        opacity: loaded ? 1 : 0
        visible: opacity > 0
        onSourceChanged: { fadeIn = false; loaded = false }
        onStatusChanged: {
            if (status === Image.Loading && !loaded) fadeIn = true
            if (status === Image.Ready) loaded = true
        }
        Behavior on opacity {
            enabled: posterImage.fadeIn && !Ui.Theme.reducedMotion
            NumberAnimation { duration: posterImage.opacity < 1 ? Ui.Metrics.motionNormal : 0 }
        }
    }
    Ui.Icon {
        objectName: "assetTypeIcon"
        anchors.centerIn: parent
        visible: tile.poster === "" || posterImage.status === Image.Error
        size: Ui.Metrics.iconLg
        name: tile.mediaType === "audio" ? "audiotrack" : tile.mediaType === "video" ? "videocam" : "layers"
        tone: tile.mediaType === "audio" ? Ui.Text.Success : Ui.Text.Info
    }
    // Built only for the tile under the pointer, so a long Library carries no scrub items.
    Loader {
        anchors.fill: parent
        active: tile.scrubbing && !!tile.scrubOverlay
        sourceComponent: tile.scrubOverlay
    }
    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: caption.height + 2 * Ui.Metrics.sm
        color: Ui.Theme.scrimMedia
        opacity: tile.showCaption ? 1 : 0
        visible: opacity > 0
        Behavior on opacity {
            enabled: !Ui.Theme.reducedMotion
            NumberAnimation { duration: Ui.Metrics.motionQuick }
        }
        Column {
            id: caption
            x: Ui.Metrics.sm
            y: Ui.Metrics.sm
            width: parent.width - 2 * Ui.Metrics.sm
            spacing: Ui.Metrics.micro
            Ui.Text {
                id: assetName
                objectName: "assetName"
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
    HoverHandler {
        id: hover
        cursorShape: mouse.cursorShape
        onPointChanged: { if (hovered) tile.scrubTo(point.position.x) }
        onHoveredChanged: {
            if (hovered) tile.scrubTo(point.position.x)
            else if (tile.scrub) tile.scrub.leave(tile.asset.id || "")
        }
    }
    Ui.Tooltip {
        objectName: "assetNameTooltip"
        trigger: assetName
        visible: assetName.truncated && tile.showCaption && !tile.dragging && !mouse.pressed
        text: {
            const name = tile.asset.name || ""
            const path = typeof tile.asset.folder_path === "string" ? tile.asset.folder_path
                : (tile.asset.parent_id || "") === tile.browser.folderId
                    ? tile.browser.breadcrumbs.map(row => row.name).join(" / ") : ""
            return name + (path !== "" ? "\n" + path : "")
        }
    }
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
                    sourceSize: Context.thumbSize(dragPreview.width, dragPreview.height, Screen.devicePixelRatio)
                    fillMode: Image.PreserveAspectCrop
                }
                Ui.Icon {
                    anchors.centerIn: parent
                    visible: dragImage.status !== Image.Ready
                    size: Ui.Metrics.iconLg
                    name: tile.mediaType === "audio" ? "audiotrack" : tile.mediaType === "video" ? "videocam" : "layers"
                    tone: tile.mediaType === "audio" ? Ui.Text.Success : Ui.Text.Info
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
        // The browser starts a platform drag that can leave the window, as the
        // node editor catalog does.
        DragHandler {
            objectName: "assetExternalDrag"
            enabled: tile.externalDrag && !tile.isFolder && !!tile.browser.dragAsset
            target: null
            onActiveChanged: if (active) tile.browser.dragAsset(tile.asset)
        }
        objectName: "assetDragPointer"
        anchors.fill: parent
        drag.target: tile.isFolder || tile.externalDrag ? null : dragPoint
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: tile.dragging ? (tile.dropAllowed ? (tile.dragAction === Qt.MoveAction ? Qt.DragMoveCursor : Qt.DragCopyCursor) : Qt.ForbiddenCursor) : Qt.OpenHandCursor
        onDoubleClicked: { if (tile.isFolder) tile.openFolder(); else tile.previewRequested() }
        onPressed: event => {
            tile.forceActiveFocus()
            // Source opens at the hovered time, so the cue goes in before the selection reaches it.
            if (event.button === Qt.LeftButton && tile.scrubbing && tile.scrub) tile.scrub.cue(tile.asset)
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

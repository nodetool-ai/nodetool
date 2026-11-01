import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "AssetContext.js" as Context

Ui.Surface {
    id: explorer
    variant: Ui.Surface.Canvas
    objectName: "assetExplorer"
    property var timeline: null
    property alias browser: browserModel
    property alias selectedId: grid.selectedId
    property var actionCallback: null
    property string tagAssetId: ""
    property string tagBaseText: ""
    property string tagDraft: ""
    readonly property string libraryIdentity: browserModel.libraryScope
    onLibraryIdentityChanged: Qt.callLater(() => {
        action.close(); moveDialog.close()
        actionCallback = null
        grid.selectedId = ""
        tagAssetId = ""; tagBaseText = ""; tagDraft = ""
        preview.closePreview()
    })
    readonly property var selectedAsset: grid.selectedAsset
    implicitWidth: TimelineMetrics.trackHeaderWidth
    width: implicitWidth
    height: parent && parent.parent ? parent.parent.height : TimelineMetrics.trackHeight * 9
    clip: true

    AssetGallery {
        id: gallery
        browser: browserModel
    }
    AssetBrowser {
        id: browserModel
        timeline: explorer.timeline
    }
    Component.onCompleted: Qt.callLater(() => {
        const editor = Context.editorFor(explorer)
        if (editor) explorer.timeline = editor.timeline
        browserModel.refresh()
    })
    function clearFilters() {
        searchDelay.stop(); tagDelay.stop()
        search.text = ""; tagSearch.text = ""
        browserModel.searchText = ""; browserModel.tagFilter = ""
        browserModel.typeFilter = ""; browserModel.favoritesOnly = false
    }
    function navigateFolder(id) {
        clearFilters()
        browserModel.openFolder(id)
    }
    onSelectedAssetChanged: {
        if (preview && preview.asset && (!selectedAsset || preview.asset.id !== selectedAsset.id)) preview.closePreview()
        const row = selectedAsset
        if (!row) return
        const tags = row.metadata ? row.metadata.tags : null
        const loaded = tags && typeof tags.join === "function" ? tags.join(", ") : ""
        if (row.id !== tagAssetId || tagDraft === tagBaseText || tagDraft === loaded) {
            tagAssetId = row.id; tagBaseText = loaded; tagDraft = loaded
            tagEditor.cancelEdit()
        }
    }
    function ask(title, explanation, value, callback, destructive = false, needsValue = true) {
        action.title = title; action.explanation = explanation; action.initialValue = value
        action.actionLabel = title; action.destructive = destructive; action.needsValue = needsValue
        action.returnFocusTo = explorer.Window.window ? explorer.Window.window.activeFocusItem : null
        explorer.actionCallback = callback; action.open()
    }
    function renameSelected() {
        const row = selectedAsset
        if (!row) return
        ask("Rename", "Rename “" + row.name + "”.", row.name, value => browserModel.renameAsset(row.id, value))
    }
    function deleteSelected() {
        const row = selectedAsset
        if (!row) return
        const contents = row.content_type === "folder" ? " All assets inside this folder will also be deleted." : ""
        ask("Delete", "Permanently delete “" + row.name + "” from the server?" + contents + " This cannot be undone.", "", () => browserModel.deleteAsset(row.id), true, false)
    }
    function isEntityAsset(row) {
        const marker = row && row.metadata ? row.metadata.nodetool_entity : null
        return !!marker && ["character", "location", "style", "prop"].indexOf(marker.kind) >= 0
    }
    // Hands an image to the Entities panel, which edits it when it already is an entity.
    function useAsEntity() {
        const row = selectedAsset
        const editor = row ? Context.editorFor(explorer) : null
        if (!editor) return
        const id = row.id, existing = isEntityAsset(row)
        // The menu is still closing. Opening the editor now would let the menu's focus return take focus from the name field.
        Qt.callLater(() => editor.openEntityEditor(id, existing))
    }
    function showPreview(row) {
        preview.openAsset(row)
        detailsExpanded = false
    }
    property bool detailsExpanded: true
    property bool filtersExpanded: false

    ScrollView {
        id: libraryScroll
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        contentWidth: width
        ScrollBar.vertical: Ui.ScrollBar {}
        clip: true
        ColumnLayout {
            width: libraryScroll.width
            spacing: Ui.Metrics.sm
            RowLayout {
                Layout.fillWidth: true
                LibraryLabel { Layout.fillWidth: true; text: "Library"; tone: Ui.Text.Primary }
                LibraryButton { iconName: "refresh"; accessibleName: "Refresh"; enabled: browserModel.configured && !browserModel.busy; onClicked: browserModel.refresh() }
                LibraryButton {
                    objectName: "libraryCreateFolder"
                    iconName: "createNewFolder"
                    accessibleName: "New folder"
                    enabled: browserModel.configured && !browserModel.busy
                    onClicked: explorer.ask("Create folder", "Create a folder in the current Library folder.", "", value => browserModel.createFolder(value))
                }
                LibraryButton { objectName: "assetImportButton"; iconName: "fileUpload"; accessibleName: "Import"; enabled: browserModel.configured; onClicked: files.open() }
            }
            RowLayout {
                Layout.fillWidth: true
            LibraryField {
                id: search
                objectName: "librarySearch"
                Layout.fillWidth: true
                placeholderText: "Search Library"
                onTextEdited: searchDelay.restart()
                onAccepted: { searchDelay.stop(); browserModel.searchText = text }
                Timer { id: searchDelay; interval: 250; onTriggered: browserModel.searchText = search.text }
            }
                LibraryButton { objectName: "libraryFiltersButton"; iconName: "tune"; accessibleName: "Filters"; checkable: true; checked: explorer.filtersExpanded; onClicked: explorer.filtersExpanded = checked }
            }
            RowLayout {
                visible: explorer.filtersExpanded
                Layout.fillWidth: true

                LibraryButton {
                    objectName: "libraryFavoritesButton"
                    text: "Favorites"
                    checkable: true
                    checked: browserModel.favoritesOnly
                    onClicked: browserModel.favoritesOnly = checked
                }
            }
            LibraryField {
                id: tagSearch
                objectName: "libraryTagFilter"
                visible: explorer.filtersExpanded
                Layout.fillWidth: true
                placeholderText: "Filter by tag"
                onTextEdited: tagDelay.restart()
                onAccepted: { tagDelay.stop(); browserModel.tagFilter = text.trim() }
                Timer { id: tagDelay; interval: 250; onTriggered: browserModel.tagFilter = tagSearch.text.trim() }
            }
            Ui.Select {
                id: types
                objectName: "libraryTypeFilter"
                Layout.fillWidth: true
                options: [{label:"All types",value:""},{label:"Images",value:"image"},{label:"Video",value:"video"},{label:"Audio",value:"audio"},{label:"Folders",value:"folder"},{label:"Other",value:"other"}]
                value: browserModel.typeFilter
                accessibleName: "Asset type"
                onValueCommitted: next => browserModel.typeFilter = next
            }
            RowLayout {
                Layout.fillWidth: true
                visible: browserModel.folderId !== ""
                LibraryButton { objectName: "assetFolderUp"; iconName: "arrowUpward"; accessibleName: "Up"; enabled: browserModel.folderId !== ""; onClicked: { explorer.clearFilters(); browserModel.goUp() } }
                Flickable {
                    Layout.fillWidth: true
                    Layout.preferredHeight: Ui.Metrics.compact
                    contentWidth: crumbs.implicitWidth
                    contentHeight: height
                    clip: true
                    Row {
                        id: crumbs
                        spacing: Ui.Metrics.xs
                        LibraryButton { objectName: "libraryRootBreadcrumb"; iconName: "home"; accessibleName: "Library root"; onClicked: explorer.navigateFolder("") }
                        Repeater {
                            model: browserModel.breadcrumbs.filter(row => row.id !== "")
                            LibraryButton {
                                required property var modelData
                                text: modelData.name || "Folder"
                                onClicked: explorer.navigateFolder(modelData.id)
                            }
                        }
                    }
                }

            }
            LibraryLabel { Layout.fillWidth: true; visible: !browserModel.configured; text: "Open a server timeline to browse and import assets." }
            LibraryLabel { Layout.fillWidth: true; visible: browserModel.error !== ""; text: browserModel.error; tone: Ui.Text.Error }
            LibraryButton { visible: browserModel.error !== ""; text: "Retry loading"; enabled: !browserModel.busy; onClicked: browserModel.refresh() }
            LibraryLabel { visible: browserModel.busy; text: "Loading Library…" }
            LibraryLabel { Layout.fillWidth: true; visible: grid.filtered; text: "Filters search across all folders." }
            RowLayout {
                Layout.fillWidth: true
                LibraryLabel { Layout.fillWidth: true; text: browserModel.assets.length + " assets" }
                LibraryButton { visible: grid.filtered; text: "Clear filters"; onClicked: explorer.clearFilters() }
            }
            AssetGrid {
                id: grid
                objectName: "libraryGrid"
                Layout.fillWidth: true
                Layout.preferredHeight: Math.max(TimelineMetrics.trackHeight * 2, explorer.height - Ui.Metrics.comfortable * (explorer.filtersExpanded ? 10 : 8))
                Layout.minimumHeight: TimelineMetrics.trackHeight
                browser: browserModel
                navigateFolder: id => explorer.navigateFolder(id)
                onPreviewRequested: row => gallery.openAsset(row)
                onActionsRequested: row => { selectedId = row.id; assetMenu.returnFocusTo = explorer.Window.window ? explorer.Window.window.activeFocusItem : null; assetMenu.popup() }
                onImportRequested: files.open()
                onClearFiltersRequested: explorer.clearFilters()
            }
            RowLayout {
                visible: !!explorer.selectedAsset
                Layout.fillWidth: true
                LibraryButton {
                    Layout.fillWidth: true
                    text: explorer.selectedAsset ? explorer.selectedAsset.name : ""
                    onClicked: explorer.detailsExpanded = !explorer.detailsExpanded
                    Accessible.name: "Show asset details"
                }
                LibraryButton {
                    text: "Actions"
                    onClicked: { assetMenu.returnFocusTo = explorer.Window.window ? explorer.Window.window.activeFocusItem : null; assetMenu.popup() }
                }
                LibraryButton {
                    text: explorer.selectedAsset && explorer.selectedAsset.content_type === "folder" ? "Open" : "Preview"
                    onClicked: {
                        const row = explorer.selectedAsset
                        if (row.content_type === "folder") explorer.navigateFolder(row.id)
                        else explorer.showPreview(row)
                    }
                }
            }
            ScrollView {
                visible: !!explorer.selectedAsset && explorer.detailsExpanded
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(details.implicitHeight, explorer.height / 4)
                contentWidth: availableWidth
                clip: true
                ColumnLayout {
                    id: details
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    LibraryLabel {
                        Layout.fillWidth: true
                        text: {
                            const row = explorer.selectedAsset
                            if (!row) return ""
                            let text = row.content_type || "File"
                            if (typeof row.size === "number") text += " · " + row.size + " bytes"
                            if (row.duration) text += " · " + row.duration + " seconds"
                            const metadata = row.metadata || {}
                            if (metadata.width && metadata.height) text += " · " + metadata.width + " × " + metadata.height
                            return text
                        }
                    }
                    LibraryLabel { text: "Tags (comma separated)" }
                    LibraryField {
                        id: tagEditor
                        objectName: "libraryTagEditor"
                        Layout.fillWidth: true
                        accessibleName: "Asset tags"
                        value: explorer.tagDraft
                        onTextEdited: explorer.tagDraft = text
                    }
                    RowLayout {
                        Layout.fillWidth: true
                        LibraryButton {
                            objectName: "librarySaveTags"
                            text: "Save tags"
                            enabled: !browserModel.busy
                            onClicked: browserModel.setAssetTags(grid.selectedId, tagEditor.text.split(",").map(tag => tag.trim()).filter(tag => tag !== ""))
                        }
                        LibraryButton {
                            objectName: "libraryFavorite"
                            Layout.fillWidth: true
                            text: explorer.selectedAsset && explorer.selectedAsset.favorite ? "Unfavorite" : "Favorite"
                            onClicked: browserModel.setFavorite(grid.selectedId, !explorer.selectedAsset.favorite)
                        }
                    }
                    LibraryLabel {
                        Layout.fillWidth: true
                        text: explorer.selectedAsset && explorer.selectedAsset.offline ? "The original file is offline." : ""
                        visible: text !== ""
                        tone: Ui.Text.Warning
                    }
                    LibraryButton {
                        id: moreMetadata
                        text: "More metadata"
                        checkable: true
                        visible: !!explorer.selectedAsset
                    }
                    LibraryLabel {
                        Layout.fillWidth: true
                        text: explorer.selectedAsset && explorer.selectedAsset.created_at ? "Created: " + explorer.selectedAsset.created_at : ""
                        visible: text !== ""
                    }
                    LibraryLabel {
                        Layout.fillWidth: true
                        text: explorer.selectedAsset && explorer.selectedAsset.metadata ? JSON.stringify(explorer.selectedAsset.metadata, null, 2) : ""
                        visible: moreMetadata.checked && text !== "" && text !== "{}"
                        role: Ui.Typography.MonoCaption
                        wrapMode: Text.WrapAnywhere
                    }
                    LibraryLabel {
                        Layout.fillWidth: true
                        text: explorer.selectedAsset ? "ID: " + explorer.selectedAsset.id : ""
                        visible: moreMetadata.checked
                        role: Ui.Typography.MonoCaption
                        wrapMode: Text.WrapAnywhere
                    }
                }
            }
            Ui.Toggle {
                objectName: "libraryPreviewAudio"
                visible: preview.visible && (preview.mediaType === "audio" || preview.mediaType === "video")
                text: "Preview audio"
                onToggled: preview.audioMode = checked ? "system" : "none"
            }
            AssetPreview {
                id: preview
                browser: browserModel
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(implicitHeight, explorer.height / 3)
            }
            LibraryButton {
                id: transfersToggle
                visible: browserModel.transfers.length > 0
                Layout.fillWidth: true
                text: "Transfers (" + browserModel.transfers.length + ")"
                checkable: true
            }
            ScrollView {
                visible: transfersToggle.visible && transfersToggle.checked
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(transferRows.implicitHeight, explorer.height / 4)
                contentWidth: availableWidth
                clip: true
                ColumnLayout {
                    id: transferRows
                    width: parent.width
                    Repeater {
                        model: browserModel.transfers
                        ColumnLayout {
                            required property var modelData
                            Layout.fillWidth: true
                            LibraryLabel { Layout.fillWidth: true; text: modelData.name + " · " + modelData.status; tone: modelData.status === "failed" ? Ui.Text.Error : Ui.Text.Primary }
                            LibraryLabel { Layout.fillWidth: true; visible: modelData.error !== ""; text: modelData.error || ""; tone: Ui.Text.Error }
                            LibraryButton { visible: modelData.status === "failed"; text: "Retry import"; onClicked: browserModel.retryImport(modelData.id) }
                        }
                    }
                    LibraryButton { text: "Clear finished transfers"; onClicked: browserModel.clearFinishedTransfers() }
                }
            }
        }
    }
    Ui.ContextMenu {
        id: assetMenu
        Ui.MenuItem {
            objectName: "libraryEntityAction"
            text: explorer.isEntityAsset(explorer.selectedAsset) ? "Edit entity…" : "Use as entity…"
            enabled: !!explorer.selectedAsset && String(explorer.selectedAsset.content_type || "").startsWith("image/") && !browserModel.busy
            onTriggered: explorer.useAsEntity()
        }
        Ui.MenuItem { text: "Rename"; enabled: !!explorer.selectedAsset && !browserModel.busy; onTriggered: explorer.renameSelected() }
        Ui.MenuItem { text: "Move to folder…"; enabled: !!explorer.selectedAsset && !browserModel.busy; onTriggered: moveDialog.open() }


        Ui.Separator {}
        Ui.MenuItem { text: "Delete from server…"; enabled: !!explorer.selectedAsset && !browserModel.busy; onTriggered: explorer.deleteSelected() }
    }

    AssetBrowser {
        id: destinationBrowser
        timeline: explorer.timeline
        typeFilter: "folder"
    }
    Ui.Dialog {
        id: moveDialog
        property string movingId: ""
        property string destinationId: ""
        title: "Move asset"
        width: Math.min(TimelineMetrics.trackHeaderWidth, parent ? parent.width - Ui.Metrics.xl * 2 : TimelineMetrics.trackHeaderWidth)
        height: Math.min(implicitHeight, parent ? parent.height - Ui.Metrics.xl * 2 : implicitHeight)
        onOpened: { movingId = grid.selectedId; destinationId = ""; destinationBrowser.refresh() }
        ColumnLayout {
            width: parent.width
            LibraryLabel { Layout.fillWidth: true; text: "Choose a destination folder, or move to the Library root." }
            Ui.Select {
                id: moveTarget
                Layout.fillWidth: true
                options: [{id:"",name:"Library root"}].concat(destinationBrowser.assets.filter(row => row.id !== moveDialog.movingId)).map(row => ({label:row.name,value:row.id}))
                value: moveDialog.destinationId
                accessibleName: "Destination folder"
                onValueCommitted: next => moveDialog.destinationId = next
            }
            LibraryLabel { Layout.fillWidth: true; visible: destinationBrowser.busy; text: "Loading folders…" }
            LibraryLabel { Layout.fillWidth: true; visible: destinationBrowser.error !== ""; text: destinationBrowser.error; tone: Ui.Text.Error }
            RowLayout {
                LibraryButton { text: "Cancel"; onClicked: moveDialog.close() }
                LibraryButton { text: "Move"; enabled: !destinationBrowser.busy && !browserModel.busy; onClicked: { browserModel.moveAsset(moveDialog.movingId, moveDialog.destinationId); moveDialog.close() } }
            }
        }
    }

    LibraryActionDialog { id: action; objectName: "libraryActionDialog"; onConfirmed: value => { if (explorer.actionCallback) explorer.actionCallback(value) } }
    FileDialog { id: files; title: "Import assets"; fileMode: FileDialog.OpenFiles; onAccepted: browserModel.importFiles(selectedFiles) }
    DropArea {
        id: fileDrop
        anchors.fill: parent
        keys: ["text/uri-list"]
        enabled: browserModel.configured
        onEntered: drag => { drag.accepted = drag.hasUrls }
        onDropped: drop => { if (drop.hasUrls) { browserModel.importFiles(drop.urls); drop.acceptProposedAction() } }
        Rectangle {
            anchors.fill: parent
            visible: fileDrop.containsDrag
            color: Ui.Theme.actionSelected
            border.color: Ui.Theme.accentPrimary
            LibraryLabel { anchors.centerIn: parent; text: "Drop files here"; tone: Ui.Text.Primary }
        }
    }
}

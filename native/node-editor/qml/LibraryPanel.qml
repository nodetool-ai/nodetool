import QtQuick
import QtQuick.Controls
import QtQuick.Dialogs
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.Media as Media

// The web left panel's asset library: the account's assets in one folder,
// shown with the shared NodeTool.Media asset grid and the timeline Library
// toolbar. A tile dragged onto the canvas adds the matching constant node.
Rectangle {
    id: root
    EditorRoles { id: roles }
    color: roles.panel
    implicitWidth: Ui.Metrics.dialogCompactWidth
    property bool filtersExpanded: false
    component LibraryButton: Ui.EditorButton { density: Ui.EditorButton.Compact; accessibleName: text }
    component LibraryLabel: Ui.Text { role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary; wrapMode: Text.Wrap }
    function clearFilters() {
        search.text = ""; tagSearch.text = ""
        libraryBrowser.searchText = ""; libraryBrowser.typeFilter = ""; libraryBrowser.tagFilter = ""; libraryBrowser.favoritesOnly = false
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm
        RowLayout {
            Layout.fillWidth: true
            LibraryLabel { Layout.fillWidth: true; text: "Library"; tone: Ui.Text.Primary }
            LibraryButton { objectName: "library-refresh"; iconName: "refresh"; accessibleName: "Refresh"; enabled: libraryBrowser.configured && !libraryBrowser.busy; onClicked: libraryBrowser.refresh() }
            LibraryButton { objectName: "library-create-folder"; iconName: "createNewFolder"; accessibleName: "New folder"; enabled: libraryBrowser.configured && !libraryBrowser.busy; onClicked: { folderName.text = ""; folderDialog.open() } }
            LibraryButton { objectName: "library-import"; iconName: "fileUpload"; accessibleName: "Import"; enabled: libraryBrowser.configured; onClicked: { importError.text = ""; importDialog.open() } }
            LibraryButton { objectName: "library-close"; iconName: "close"; accessibleName: "Close the asset library"; onClicked: editor.action("Library") }
        }
        RowLayout {
            Layout.fillWidth: true
            Ui.TextField {
                id: search
                objectName: "library-search"
                Layout.fillWidth: true
                placeholderText: "Search Library"
                accessibleName: placeholderText
                selectByMouse: true
                onTextEdited: searchDelay.restart()
                onAccepted: { searchDelay.stop(); libraryBrowser.searchText = text }
                Timer { id: searchDelay; interval: 250; onTriggered: libraryBrowser.searchText = search.text }
            }
            Ui.MenuButton {
                id: types
                objectName: "library-type-filter"
                readonly property var options: [{label:"All types",value:""},{label:"Images",value:"image"},{label:"Video",value:"video"},{label:"Audio",value:"audio"},{label:"Folders",value:"folder"},{label:"Other",value:"other"}]
                readonly property var current: options.find(option => option.value === libraryBrowser.typeFilter) || options[0]
                density: Ui.EditorButton.Compact
                iconName: "categoryOutlined"
                active: libraryBrowser.typeFilter !== ""
                accessibleName: "Asset type: " + current.label
                menu: typeMenu
                Ui.ContextMenu {
                    id: typeMenu
                    returnFocusTo: types
                    Repeater {
                        model: types.options
                        delegate: Ui.MenuItem {
                            required property var modelData
                            objectName: "library-type-" + (modelData.value || "all")
                            text: modelData.label
                            checkable: true
                            checked: libraryBrowser.typeFilter === modelData.value
                            onTriggered: libraryBrowser.typeFilter = modelData.value
                        }
                    }
                }
            }
            LibraryButton { objectName: "library-filters"; iconName: "tune"; accessibleName: "Filters"; checkable: true; checked: root.filtersExpanded; onClicked: root.filtersExpanded = checked }
        }
        RowLayout {
            visible: root.filtersExpanded
            Layout.fillWidth: true
            LibraryButton { objectName: "library-favorites"; text: "Favorites"; checkable: true; checked: libraryBrowser.favoritesOnly; onClicked: libraryBrowser.favoritesOnly = checked }
        }
        Ui.TextField {
            id: tagSearch
            objectName: "library-tag-filter"
            visible: root.filtersExpanded
            Layout.fillWidth: true
            placeholderText: "Filter by tag"
            accessibleName: placeholderText
            selectByMouse: true
            onTextEdited: tagDelay.restart()
            onAccepted: { tagDelay.stop(); libraryBrowser.tagFilter = text.trim() }
            Timer { id: tagDelay; interval: 250; onTriggered: libraryBrowser.tagFilter = tagSearch.text.trim() }
        }
        RowLayout {
            Layout.fillWidth: true
            visible: libraryBrowser.breadcrumbs.length > 1
            LibraryButton { objectName: "library-up"; iconName: "arrowUpward"; accessibleName: "Up"; onClicked: { root.clearFilters(); libraryBrowser.goUp() } }
            Flickable {
                Layout.fillWidth: true
                Layout.preferredHeight: Ui.Metrics.compact
                contentWidth: crumbs.implicitWidth
                contentHeight: height
                clip: true
                Row {
                    id: crumbs
                    objectName: "library-path"
                    spacing: Ui.Metrics.xs
                    LibraryButton { iconName: "home"; accessibleName: "Library root"; onClicked: { root.clearFilters(); libraryBrowser.openFolder(libraryBrowser.breadcrumbs[0].id) } }
                    Repeater {
                        model: libraryBrowser.breadcrumbs.slice(1)
                        LibraryButton {
                            required property var modelData
                            text: modelData.name || "Folder"
                            onClicked: { root.clearFilters(); libraryBrowser.openFolder(modelData.id) }
                        }
                    }
                }
            }
        }
        LibraryButton { visible: !libraryBrowser.configured; text: "Connect to server"; onClicked: editor.action("Connect") }
        LibraryLabel { objectName: "library-error"; Layout.fillWidth: true; visible: libraryBrowser.error !== ""; text: libraryBrowser.error; tone: Ui.Text.Error }
        LibraryLabel { id: importError; objectName: "library-import-error"; Layout.fillWidth: true; visible: text !== ""; tone: Ui.Text.Error }
        LibraryLabel { visible: libraryBrowser.busy; text: "Loading Library…" }
        LibraryLabel { Layout.fillWidth: true; visible: grid.filtered; text: "Filters search across all folders." }
        RowLayout {
            Layout.fillWidth: true
            LibraryLabel { Layout.fillWidth: true; text: libraryBrowser.assetModel.count + " assets" }
            Ui.Slider {
                objectName: "library-tile-size"
                Layout.preferredWidth: Ui.Metrics.comfortable * 4
                from: 56
                to: 200
                stepSize: 4
                value: grid.tileSize
                onValuePreviewed: next => grid.tileSize = next
                onValueCommitted: next => grid.tileSize = next
                accessibleName: "Tile size"
                density: Ui.EditorButton.Compact
            }
            LibraryButton { visible: grid.filtered; text: "Clear filters"; onClicked: root.clearFilters() }
        }
        Media.AssetGrid {
            id: grid
            objectName: "library-grid"
            Layout.fillWidth: true
            Layout.fillHeight: true
            browser: libraryBrowser
            externalDrag: true
            onImportRequested: { importError.text = ""; importDialog.open() }
            onClearFiltersRequested: root.clearFilters()
        }
    }
    FileDialog {
        id: importDialog
        fileMode: FileDialog.OpenFiles
        onAccepted: selectedFiles.forEach((file, index) => assetPickerController.upload("library-import:" + index, "asset", file))
    }
    Ui.Dialog {
        id: folderDialog
        objectName: "library-folder-dialog"
        title: "Create folder"
        width: Ui.Metrics.dialogCompactWidth
        Ui.TextField {
            id: folderName
            objectName: "library-folder-name"
            placeholderText: "Name"
            accessibleName: placeholderText
            onAccepted: folderDialog.accept()
        }
        onAccepted: libraryBrowser.createFolder(folderName.text)
    }
    Connections {
        target: assetPickerController
        function onUploaded(key) { if (key.startsWith("library-import:")) libraryBrowser.refresh() }
        function onFailed(key, message) { if (key.startsWith("library-import:")) importError.text = message }
    }
}

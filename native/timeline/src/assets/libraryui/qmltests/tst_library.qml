import QtQuick
import QtQuick.Controls
import QtTest
import NodeTool.Timeline

Item {
    id: host
    width: 280
    height: 480
    TestCase {
        id: tests
        name: "NativeLibraryUI"
        when: windowShown
        function typeText(text) {
            for (let i = 0; i < text.length; ++i) keyClick(text[i])
        }
        function mount() {
            const component = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/qml/assets/AssetExplorer.qml")
            compare(component.status, Component.Ready, component.errorString())
            const panel = createTemporaryObject(component, host, {width: host.width, height: host.height})
            verify(panel, component.errorString())
            return panel
        }
        function test_searchFiltersAndClear() {
            const panel = mount()
            const search = findChild(panel, "librarySearch")
            verify(search)
            search.forceActiveFocus()
            typeText("sunset")
            keyClick(Qt.Key_Return)
            compare(panel.browser.searchText, "sunset")
            const filterButton = findChild(panel, "libraryFiltersButton")
            mouseClick(filterButton)
            verify(panel.filtersExpanded)
            const tags = findChild(panel, "libraryTagFilter")
            tags.forceActiveFocus()
            typeText("reference")
            keyClick(Qt.Key_Return)
            compare(panel.browser.tagFilter, "reference")
            const types = findChild(panel, "libraryTypeFilter")
            types.currentIndex = 2
            types.activated(2)
            compare(panel.browser.typeFilter, "video")
            mouseClick(findChild(panel, "libraryFavoritesButton"))
            compare(panel.browser.favoritesOnly, true)
            panel.clearFilters()
            compare(panel.browser.searchText, "")
            compare(panel.browser.tagFilter, "")
            compare(panel.browser.typeFilter, "")
            compare(panel.browser.favoritesOnly, false)
            compare(search.text, "")
            compare(tags.text, "")
        }
        function test_emptyCollectionStaysSelected() {
            const panel = mount()
            const saved = findChild(panel, "libraryCollections")
            verify(saved)
            saved.scope = "native-library-mounted-test"
            const id = saved.create("Empty mounted collection")
            verify(id.length === 32)
            saved.selectedId = id
            compare(panel.browser.collectionActive, true)
            compare(panel.browser.collectionAssetIds.length, 0)
            compare(findChild(panel, "libraryCollectionPicker").currentText, "Empty mounted collection")
            panel.clearFilters()
            compare(saved.selectedId, "")
            compare(panel.browser.collectionActive, false)
            verify(saved.remove(id))
        }
        function test_folderPromptRequiresNameAndKeyboardConfirms() {
            const panel = mount()
            let submitted = ""
            panel.ask("Create folder", "Create a folder in this Library.", "", value => { submitted = value })
            const dialog = findChild(panel, "libraryActionDialog")
            tryCompare(dialog, "opened", true)
            const input = findChild(dialog, "libraryActionInput")
            verify(input)
            keyClick(Qt.Key_Return)
            compare(submitted, "")
            compare(dialog.opened, true)
            typeText("References")
            keyClick(Qt.Key_Return)
            compare(submitted, "References")
            tryCompare(dialog, "opened", false)
        }
        function test_narrowDockAndDialogStayWithinHost() {
            const panel = mount()
            compare(panel.width, 280)
            const grid = findChild(panel, "libraryGrid")
            verify(grid)
            verify(grid.width > 0 && grid.width <= panel.width)
            panel.ask("Delete", "Delete this asset from the server?", "", () => {}, true, false)
            const dialog = findChild(panel, "libraryActionDialog")
            tryCompare(dialog, "opened", true)
            verify(dialog.width <= host.width)
            verify(dialog.height <= host.height)
            keyClick(Qt.Key_Escape)
            tryCompare(dialog, "opened", false)
            compare(panel.selectedId, "")
            compare(panel.browser.assets.length, 0)
        }
    }
}

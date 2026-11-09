import QtQuick
import QtQuick.Controls
import QtTest
import NodeTool.Timeline

Item {
    id: host
    width: 280
    height: 480
    Component { id: browserComponent; AssetBrowser {} }
    TestCase {
        id: tests
        name: "NativeLibraryUI"
        when: windowShown
        function test_truncatedAssetNameRevealsItsFullText() {
            const browser = createTemporaryObject(browserComponent, host)
            const component = Qt.createComponent("qrc:/qt/qml/NodeTool/Media/qml/AssetItem.qml")
            compare(component.status, Component.Ready, component.errorString())
            const name = "A long descriptive asset name ".repeat(10)
            const tile = createTemporaryObject(component, host, {
                width: 120, height: 100, browser: browser,
                asset: {id: "long-name", name: name, content_type: "image/png"}
            })
            verify(tile, component.errorString())
            const tip = findChild(tile, "assetNameTooltip")
            verify(tip)
            mouseMove(tile, tile.width / 2, tile.height / 2)
            tryVerify(() => tip.visible, 1500)
            compare(tip.text.split("\n")[0], name)
            tile.asset = {id: "short-name", name: "Short", content_type: "image/png"}
            tryVerify(() => !tip.visible)
            tile.asset = {id: "long-name", name: name, content_type: "image/png"}
            mouseMove(tile, -10, -10)
            tile.forceActiveFocus(Qt.TabFocusReason)
            tryVerify(() => tip.visible, 1500)
        }
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
            mouseClick(findChild(panel, "libraryTypeFilter"))
            const typeMenu = findChild(panel, "libraryTypeMenu")
            tryVerify(() => typeMenu.opened)
            typeMenu.itemAt(2).triggered()
            typeMenu.close()
            compare(panel.browser.typeFilter, "video")
            findChild(panel, "libraryFavoritesButton").forceActiveFocus()
            keyClick(Qt.Key_Space)
            compare(panel.browser.favoritesOnly, true)
            panel.clearFilters()
            compare(panel.browser.searchText, "")
            compare(panel.browser.tagFilter, "")
            compare(panel.browser.typeFilter, "")
            compare(panel.browser.favoritesOnly, false)
            compare(search.text, "")
            compare(tags.text, "")
        }
        function test_typeFilterVisibleWithoutExpandingFilters() {
            const panel = mount()
            compare(panel.filtersExpanded, false)
            const types = findChild(panel, "libraryTypeFilter")
            verify(types.visible)
            const menu = findChild(panel, "libraryTypeMenu")
            const values = ["", "image", "video", "audio", "folder", "other"]
            for (const index of [1, 2, 3, 4, 5, 0]) {
                const value = values[index]
                compare(menu.itemAt(index).objectName, "libraryType_" + (value || "all"))
                menu.itemAt(index).triggered()
                compare(panel.browser.typeFilter, value)
                compare(types.active, value !== "")
            }
            panel.browser.typeFilter = "audio"
            panel.clearFilters()
            compare(types.active, false)
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
            verify(!findChild(panel, "libraryRootBreadcrumb").visible)
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

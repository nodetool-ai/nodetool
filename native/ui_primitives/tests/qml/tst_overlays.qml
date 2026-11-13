import QtQuick
import QtTest
import NodeTool.UiPrimitives as Ui

TestCase {
    id: test
    name: "Overlays"
    when: windowShown
    visible: true
    width: 320
    height: 240
    Ui.EditorButton { id: trigger; x: 280; y: 205; width: 35; text: "Open"; onClicked: popover.openAt(trigger) }
    Ui.Tooltip { id: tooltip; trigger: trigger; text: "Tooltip near the edge"; delay: 0 }
    Ui.Popover { id: popover; width: 140; height: 90; Ui.Text { text: "Details" } }
    Ui.ContextMenu {
        id: menu
        returnFocusTo: trigger
        Ui.MenuItem { objectName: "firstMenuItem"; text: "First"; iconName: "check"; textTone: Ui.Text.Error; shortcutText: "Ctrl+N"; accessibleName: "First action"; onTriggered: menuCount++ }
        Ui.MenuItem { objectName: "disabledMenuItem"; text: "Disabled"; enabled: false; reasonText: "Select a clip first."; onTriggered: menuCount += 100 }
        Ui.MenuItem { text: "Last"; onTriggered: menuCount += 10 }
        Ui.ContextMenu { title: "More"; Ui.MenuItem { text: "Nested"; onTriggered: menuCount += 1000 } }
    }
    Ui.ContextMenu {
        id: repeatedMenu
        returnFocusTo: trigger
        Repeater {
            model: ["Gain", "EQ", "Filter"]
            delegate: Ui.MenuItem {
                required property string modelData
                text: modelData
                onTriggered: menuCount++
            }
        }
    }
    Ui.ContextMenu {
        id: dataMenu
        returnFocusTo: trigger
        entries: [
            { id: "open", label: "Open", icon: "check", shortcut: "Ctrl+O" },
            { header: "Section" },
            { id: "pick", label: "Pick", checked: true },
            { id: "other", label: "Other", checked: false },
            { separator: true },
            { id: "gone", label: "Delete", destructive: true, enabled: false, reason: "Nothing selected." },
            { id: "more", label: "More", submenu: [ { id: "nested", label: "Nested" } ] }
        ]
        onEntryTriggered: id => chosen.push(id)
    }
    property var chosen: []
    Ui.Surface { id: selectedSurface; width: 50; height: 30; selected: true }
    Ui.PanelHeader {
        id: header
        x: 10; y: 80; width: 230
        text: "Panel"
        Ui.EditorButton { id: headerAction; text: "Action" }
    }
    SignalSpy { id: headerClicks; target: headerAction; signalName: "clicked" }
    property int menuCount: 0
    Ui.ListRow {
        id: row
        x: 10; y: 20; width: 200; height: 40
        accessibleName: "Model"
        Ui.Text { id: rowText; text: "Model"; anchors.verticalCenter: parent.verticalCenter }
        Ui.ToolbarIconButton { id: nested; anchors.right: parent.right; iconName: "star"; accessibleName: "Favorite" }
    }
    SignalSpy { id: rowClicks; target: row; signalName: "clicked" }
    SignalSpy { id: nestedClicks; target: nested; signalName: "clicked" }
    function init() { chosen = []; menuCount = 0; rowClicks.clear(); nestedClicks.clear(); Ui.Theme.preference = Ui.Theme.Dark }
    function test_tooltipStaysInOverlay() {
        tooltip.text = "A translated tooltip with a long description ".repeat(6)
        tooltip.visible = true
        tryVerify(() => tooltip.visible)
        verify(tooltip.x >= 0 && tooltip.y >= 0)
        verify(tooltip.x + tooltip.width <= test.Window.window.width)
        verify(tooltip.y + tooltip.height <= test.Window.window.height)
        tooltip.visible = false
    }
    // A hidden tooltip must not follow its trigger's ancestors: a window
    // resize moves many of them for each tooltip in the window.
    function test_hiddenTooltipIgnoresMoves() {
        const anchors = []
        const record = () => anchors.push(tooltip.anchorPoint)
        tooltip.anchorPointChanged.connect(record)
        trigger.x = 200
        trigger.x = 280
        tooltip.anchorPointChanged.disconnect(record)
        compare(anchors.length, 0)
        tooltip.visible = true
        tryVerify(() => tooltip.visible)
        const shown = tooltip.anchorPoint.x
        trigger.x = 200
        compare(tooltip.anchorPoint.x, shown - 80)
        trigger.x = 280
        tooltip.visible = false
    }
    function test_selectedSurfaceTracksTheme() {
        compare(selectedSurface.border.color, Ui.Theme.borderFocus)
        Ui.Theme.preference = Ui.Theme.Light
        compare(selectedSurface.border.color, Ui.Theme.borderFocus)
    }
    function test_headerSlot() {
        headerClicks.clear()
        verify(headerAction.width > 0)
        mouseClick(headerAction)
        compare(headerClicks.count, 1)
    }
    function test_popoverBoundsAndFocus() {
        trigger.forceActiveFocus()
        mouseClick(trigger)
        tryVerify(() => popover.visible)
        verify(popover.x >= 0 && popover.y >= 0)
        verify(popover.x + popover.width <= test.width)
        verify(popover.y + popover.height <= test.height)
        Ui.Theme.preference = Ui.Theme.Light
        verify(popover.visible)
        keyClick(Qt.Key_Escape)
        tryVerify(() => !popover.visible)
        verify(trigger.activeFocus)
    }
    function test_nestedActionDoesNotSelectRow() {
        mouseClick(nested)
        compare(nestedClicks.count, 1)
        compare(rowClicks.count, 0)
        mouseClick(row, 20, row.height / 2)
        compare(rowClicks.count, 1)
    }
    function test_repeatedMenuPointer() {
        repeatedMenu.openAt(trigger)
        tryVerify(() => repeatedMenu.visible)
        const first = repeatedMenu.itemAt(0)
        verify(first !== null)
        verify(first.width > 0)
        mouseClick(first)
        compare(menuCount, 1)
        tryVerify(() => !repeatedMenu.visible)
    }
    function test_nestedMenuKeyboard() {
        trigger.forceActiveFocus()
        menu.popup(trigger)
        tryVerify(() => menu.visible)
        keyClick(Qt.Key_Down)
        keyClick(Qt.Key_Down)
        keyClick(Qt.Key_Down)
        keyClick(Qt.Key_Right)
        keyClick(Qt.Key_Down)
        keyClick(Qt.Key_Return)
        compare(menuCount, 1000)
    }
    function test_entriesBuildItems() {
        compare(dataMenu.count, 7)
        compare(dataMenu.itemFor("open").shortcutText, "Ctrl+O")
        verify(!dataMenu.itemFor("open").checkable)
        verify(dataMenu.itemFor("pick").checkable && dataMenu.itemFor("pick").checked)
        verify(dataMenu.itemFor("other").checkable && !dataMenu.itemFor("other").checked)
        verify(!dataMenu.itemFor("gone").enabled)
        compare(dataMenu.itemFor("gone").reasonText, "Nothing selected.")
        compare(dataMenu.itemFor("gone").textTone, Ui.Text.Error)
        verify(dataMenu.itemFor("more").subMenu !== null)
        compare(dataMenu.itemFor("nope"), null)
        compare(dataMenu.itemFor("open").objectName, "menu-item-open")
    }
    function test_entriesEmitTheChosenId() {
        dataMenu.openAt(trigger)
        tryVerify(() => dataMenu.visible)
        mouseClick(dataMenu.itemFor("pick"))
        compare(chosen, ["pick"])
        tryVerify(() => !dataMenu.visible)
    }
    function test_changingEntriesRebuildsTheMenu() {
        const before = dataMenu.entries
        dataMenu.entries = [{ id: "only", label: "Only" }]
        compare(dataMenu.count, 1)
        compare(dataMenu.itemFor("open"), null)
        verify(dataMenu.itemFor("only") !== null)
        dataMenu.entries = before
        compare(dataMenu.count, 7)
    }
    function test_disabledItemShowsItsReason() {
        menu.popup(trigger)
        tryVerify(() => menu.visible)
        const off = findChild(menu.contentItem, "disabledMenuItem")
        const reason = findChild(off, "menuItemReason")
        verify(reason !== null && reason.visible)
        compare(reason.text, "Select a clip first.")
        verify(off.implicitHeight > findChild(menu.contentItem, "firstMenuItem").implicitHeight)
        verify(off.implicitWidth >= reason.implicitWidth)
        const first = findChild(findChild(menu.contentItem, "firstMenuItem"), "menuItemReason")
        verify(!first.visible)
        menu.close()
        tryVerify(() => !menu.visible)
    }
    function test_menuKeyboardAndFocus() {
        trigger.forceActiveFocus()
        menu.popup(trigger)
        tryVerify(() => menu.visible)
        const first = findChild(menu.contentItem, "firstMenuItem")
        verify(first !== null)
        compare(first.Accessible.name, "First action")
        const label = findChild(first, "menuItemLabel")
        const shortcut = findChild(first, "menuItemShortcut")
        verify(label !== null && shortcut !== null)
        verify(Qt.colorEqual(label.color, Ui.Theme.statusError))
        compare(shortcut.text, "Ctrl+N")
        keyClick(Qt.Key_Down)
        keyClick(Qt.Key_Return)
        compare(menuCount, 1)
        tryVerify(() => !menu.visible)
        verify(trigger.activeFocus)
    }
}

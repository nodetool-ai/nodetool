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
    Ui.ListRow {
        id: flatRow
        x: 10; y: 70; width: 100; height: 30
        flat: true
        accessibleName: "Flat"
        Ui.Text { id: flatLabel; anchors.fill: parent; text: "Flat" }
    }
    SignalSpy { id: flatClicks; target: flatRow; signalName: "clicked" }
    Ui.ListRow {
        id: draggableRow
        x: 10; y: 110; width: 100; height: 30
        flat: true
        accessibleName: "Draggable"
        DragHandler { id: rowDrag; target: null }
        Ui.Text { anchors.fill: parent; text: "Drag" }
    }
    SignalSpy { id: draggableClicks; target: draggableRow; signalName: "clicked" }
    SignalSpy { id: rowClicks; target: row; signalName: "clicked" }
    SignalSpy { id: nestedClicks; target: nested; signalName: "clicked" }
    function init() { chosen = []; menuCount = 0; rowClicks.clear(); nestedClicks.clear(); Ui.Theme.preference = Ui.Theme.Dark }
    function test_flatRowWithADragHandlerStillClicks() {
        draggableClicks.clear()
        mouseClick(draggableRow)
        compare(draggableClicks.count, 1)
        compare(rowDrag.parent, draggableRow)
    }
    function test_flatRowHasNoPaddingAndNoMinimumHeight() {
        compare(flatRow.leftPadding, 0)
        compare(flatRow.rightPadding, 0)
        compare(flatRow.implicitHeight, 0)
        compare(flatLabel.width, 100)
        compare(flatLabel.height, 30)
        verify(row.leftPadding > 0)
        verify(row.implicitHeight >= Ui.Metrics.standard)
        flatClicks.clear()
        flatRow.forceActiveFocus()
        keyClick(Qt.Key_Return)
        compare(flatClicks.count, 1)
    }
    function test_tooltipHostReceivesTextThatTheOverlayCannotHold() {
        const received = []
        const record = text => received.push(text)
        Ui.TooltipHost.requested.connect(record)
        Ui.TooltipHost.routeToHost = true
        tooltip.text = "word ".repeat(300)
        tooltip.visible = true
        tryVerify(() => received.length > 0)
        compare(received[0], tooltip.text)
        compare(tooltip.opacity, 0)
        tooltip.visible = false
        tryVerify(() => received[received.length - 1] === "")
        Ui.TooltipHost.routeToHost = false
        Ui.TooltipHost.requested.disconnect(record)
        tooltip.text = "Tooltip near the edge"
    }
    function test_tooltipStaysInOverlayWithoutAHost() {
        const received = []
        const record = text => received.push(text)
        Ui.TooltipHost.requested.connect(record)
        tooltip.text = "word ".repeat(300)
        tooltip.visible = true
        tryVerify(() => tooltip.visible)
        compare(received.length, 0)
        compare(tooltip.opacity, 1)
        tooltip.visible = false
        Ui.TooltipHost.requested.disconnect(record)
        tooltip.text = "Tooltip near the edge"
    }
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
        dataMenu.openAt(trigger)
        tryVerify(() => dataMenu.visible)
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
        dataMenu.close()
        tryVerify(() => !dataMenu.visible)
    }
    function test_closedEntriesWaitForOpen() {
        dataMenu.close()
        tryVerify(() => !dataMenu.visible)
        const before = dataMenu.entries
        const count = dataMenu.count
        dataMenu.entries = [{ id: "deferred", label: "Deferred" }]
        compare(dataMenu.count, count)
        compare(dataMenu.itemFor("deferred"), null)
        dataMenu.openAt(trigger)
        tryVerify(() => dataMenu.visible)
        compare(dataMenu.count, 1)
        verify(dataMenu.itemFor("deferred") !== null)
        dataMenu.close()
        tryVerify(() => !dataMenu.visible)
        dataMenu.entries = []
        compare(dataMenu.count, 0)
        compare(dataMenu.itemFor("deferred"), null)
        dataMenu.openAt(trigger)
        tryVerify(() => dataMenu.visible)
        compare(dataMenu.count, 0)
        dataMenu.entries = before
        dataMenu.close()
        tryVerify(() => !dataMenu.visible)
    }
    function test_entriesEmitTheChosenId() {
        dataMenu.openAt(trigger)
        tryVerify(() => dataMenu.opened)
        verify(waitForRendering(dataMenu.contentItem))
        mouseClick(dataMenu.itemFor("pick"))
        compare(chosen, ["pick"])
        tryVerify(() => !dataMenu.visible)
    }
    function test_changingEntriesRebuildsTheMenu() {
        dataMenu.openAt(trigger)
        tryVerify(() => dataMenu.visible)
        const before = dataMenu.entries
        dataMenu.entries = [{ id: "only", label: "Only" }]
        compare(dataMenu.count, 1)
        compare(dataMenu.itemFor("open"), null)
        verify(dataMenu.itemFor("only") !== null)
        dataMenu.entries = before
        compare(dataMenu.count, 7)
        dataMenu.close()
        tryVerify(() => !dataMenu.visible)
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
    function test_popupAtClearsPreviousFocusTarget() {
        dataMenu.openAt(trigger)
        tryVerify(() => dataMenu.opened)
        dataMenu.close()
        tryVerify(() => !dataMenu.visible)
        dataMenu.popupAt(row, 0, 0)
        tryVerify(() => dataMenu.opened)
        compare(dataMenu.returnFocusTo, null)
        dataMenu.close()
        tryVerify(() => !dataMenu.visible)
        compare(dataMenu.returnFocusTo, null)
    }
    Component { id: lazyMenuComponent; Ui.ContextMenu {} }
    Component { id: lazyRowComponent; Ui.MenuItem { text: "A late populated, wide menu action" } }
    function test_lateRowsAreMeasuredAndClamped_data() {
        return [{ tag: "point", point: true }, { tag: "trigger", point: false }, { tag: "direct", direct: true }]
    }
    function test_lateRowsAreMeasuredAndClamped(data) {
        const late = createTemporaryObject(lazyMenuComponent, test)
        verify(late !== null)
        late.aboutToShow.connect(() => {
            for (let i = 0; i < 4; ++i) late.addItem(lazyRowComponent.createObject(late))
        })
        if (data.direct) late.open()
        else if (data.point) late.popupAt(trigger, trigger.width, trigger.height)
        else late.openAt(trigger)
        tryVerify(() => late.opened)
        verify(waitForRendering(late.contentItem))
        verify(late.width >= late.itemAt(0).implicitWidth)
        verify(late.x + late.width <= late.parent.width + 0.5)
        verify(late.y + late.height <= late.parent.height + 0.5)
        late.close()
    }
    Component {
        id: nullProbeComponent
        Item {
            property var menuItemCreationProbe: null
            Ui.MenuItem { text: "Without a probe" }
        }
    }
    function test_nullCreationProbeIsSafe() {
        failOnWarning(/TypeError/)
        verify(createTemporaryObject(nullProbeComponent, test) !== null)
    }
    Component { id: anchorComponent; Item { width: 30; height: 30 } }
    function test_invalidatingPopupAnchorClosesMenu_data() {
        return [{ tag: "destroyed", destroy: true }, { tag: "hidden", destroy: false }]
    }
    function test_invalidatingPopupAnchorClosesMenu(data) {
        const anchor = createTemporaryObject(anchorComponent, test)
        const late = createTemporaryObject(lazyMenuComponent, test, { entries: [{ id: "one", label: "One" }] })
        late.popupAt(anchor, 0, 0)
        tryVerify(() => late.opened)
        if (data.destroy) anchor.destroy()
        else anchor.visible = false
        tryVerify(() => !late.visible)
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

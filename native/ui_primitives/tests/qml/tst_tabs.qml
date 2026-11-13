import QtQuick
import QtTest
import NodeTool.UiPrimitives as Ui

TestCase {
    name: "Tabs"
    visible: true
    when: windowShown
    width: 600
    height: 200

    Ui.TabBar {
        id: tabBar
        objectName: "bar"
        x: 10; y: 10
        accessibleName: "Sections"
        value: "a"
        tabs: [{label: "A", value: "a", count: 3, objectName: "tabA"}, {label: "B", value: "b", disabledReason: "Not yet", objectName: "tabB"},
               {label: "C", value: "c", objectName: "tabC"}]
    }
    SignalSpy { id: committed; target: tabBar; signalName: "valueCommitted" }

    Ui.DocumentTabStrip {
        id: strip
        x: 10; y: 60; width: 200; height: 36
        accessibleName: "Documents"
        currentIndex: 0
        reorderable: true
        tabs: [{title: "One", renamable: true}, {title: "Two"}, {title: "Pinned", closable: false}]
    }
    SignalSpy { id: closed; target: strip; signalName: "closeRequested" }
    SignalSpy { id: activated; target: strip; signalName: "tabActivated" }
    SignalSpy { id: menus; target: strip; signalName: "contextMenuRequested" }
    SignalSpy { id: renames; target: strip; signalName: "renameRequested" }
    SignalSpy { id: moves; target: strip; signalName: "tabMoved" }

    Ui.SegmentedControl {
        id: segmented
        x: 10; y: 120
        accessibleName: "Platform"
        value: "mac"
        options: [{label: "macOS", value: "mac"}, {label: "Windows", value: "win", enabled: false, reason: "Soon"}, {label: "Linux", value: "linux"}]
    }
    SignalSpy { id: chosen; target: segmented; signalName: "valueCommitted" }

    function init() {
        committed.clear(); closed.clear(); activated.clear(); menus.clear(); renames.clear(); moves.clear(); chosen.clear()
        strip.renamingIndex = -1
        segmented.value = "mac"
        segmented.variant = Ui.SegmentedControl.Buttons
    }

    function test_tabBarChoosesByClick() {
        const b = findChild(tabBar, "tabB")
        mouseClick(b)
        compare(committed.count, 0)
        mouseClick(findChild(tabBar, "tabC"))
        compare(committed.count, 1)
        compare(committed.signalArguments[0][0], "c")
        compare(tabBar.Accessible.role, Accessible.PageTabList)
        compare(findChild(tabBar, "tabA").Accessible.role, Accessible.PageTab)
        verify(findChild(tabBar, "tabA").Accessible.checked)
        compare(findChild(tabBar, "tabA-count").text, "3")
    }

    function test_tabBarArrowKeysMoveFocusPastDisabled() {
        const a = findChild(tabBar, "tabA")
        a.forceFocus()
        keyClick(Qt.Key_Right)
        verify(findChild(tabBar, "tabC").activeFocus || findChild(tabBar, "tabC").children.some(c => c.activeFocus))
        keyClick(Qt.Key_Left)
        verify(a.children.some(c => c.activeFocus))
        keyClick(Qt.Key_Return)
        compare(committed.count, 1)
        compare(committed.signalArguments[0][0], "a")
    }

    function test_documentTabsCloseByButtonAndMiddleClick() {
        mouseClick(findChild(strip, "close-1"))
        compare(closed.count, 1)
        compare(closed.signalArguments[0][0], 1)
        const two = findChild(strip, "activate-1")
        mouseClick(two, two.width / 2, two.height / 2, Qt.MiddleButton)
        compare(closed.count, 2)
        // A tab that cannot close ignores the middle button.
        const pinned = findChild(strip, "activate-2")
        mouseClick(pinned, pinned.width / 2, pinned.height / 2, Qt.MiddleButton)
        compare(closed.count, 2)
        verify(!findChild(strip, "close-2").visible)
    }

    function test_documentTabsActivateMenuAndRename() {
        const two = findChild(strip, "activate-1")
        mouseClick(two)
        compare(activated.count, 1)
        compare(activated.signalArguments[0][0], 1)
        mouseClick(two, two.width / 2, two.height / 2, Qt.RightButton)
        compare(menus.count, 1)
        compare(menus.signalArguments[0][0], 1)
        // Only a renamable tab starts a rename.
        mouseDoubleClickSequence(two)
        compare(renames.count, 0)
        const one = findChild(strip, "activate-0")
        mouseDoubleClickSequence(one)
        compare(renames.count, 1)
        compare(strip.renamingIndex, 0)
    }

    function test_documentTabsReorderByDrag() {
        const one = findChild(strip, "activate-0")
        const two = findChild(strip, "activate-1")
        const from = one.mapToItem(null, one.width / 2, one.height / 2)
        const to = two.mapToItem(null, two.width * 0.8, two.height / 2)
        mousePress(strip, from.x - strip.x, from.y - strip.y)
        mouseMove(strip, from.x - strip.x + 20, from.y - strip.y)
        mouseMove(strip, to.x - strip.x, to.y - strip.y)
        mouseRelease(strip, to.x - strip.x, to.y - strip.y)
        compare(moves.count, 1)
        compare(moves.signalArguments[0][0], 0)
        compare(moves.signalArguments[0][1], 1)
        compare(moves.signalArguments[0][2], true)
        compare(activated.count, 0)
    }

    function test_segmentedChoosesOnlyEnabledOptions_data() {
        return [{tag: "buttons", variant: Ui.SegmentedControl.Buttons}, {tag: "tray", variant: Ui.SegmentedControl.Tray}]
    }
    function test_segmentedChoosesOnlyEnabledOptions(data) {
        segmented.variant = data.variant
        mouseClick(segmented, segmented.width / 2, segmented.height / 2)
        compare(chosen.count, 0)
        mouseClick(segmented, segmented.width - 4, segmented.height / 2)
        compare(chosen.count, 1)
        compare(chosen.signalArguments[0][0], "linux")
        // The caller owns the value, so the control did not move by itself.
        compare(segmented.value, "mac")
    }

    function test_segmentedArrowKeysSkipDisabledOptions() {
        findChild(segmented, "mac").forceActiveFocus()
        keyClick(Qt.Key_Right)
        compare(chosen.count, 1)
        compare(chosen.signalArguments[0][0], "linux")
        compare(segmented.Accessible.role, Accessible.Grouping)
    }
}

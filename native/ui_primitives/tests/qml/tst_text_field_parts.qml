import QtQuick
import QtTest
import NodeTool.UiPrimitives as Ui

TestCase {
    name: "TextFieldParts"
    visible: true
    when: windowShown
    width: 400; height: 200
    Ui.TextField { id: plain; width: 160; accessibleName: "Plain"; value: "text" }
    Ui.TextField { id: search; y: 60; width: 160; accessibleName: "Search"; leadingIcon: "search"; clearable: true }
    SignalSpy { id: committed; target: search; signalName: "valueCommitted" }

    function find(item, name) {
        for (let i = 0; i < item.children.length; ++i) {
            const child = item.children[i]
            if (child.objectName === name) return child
            const found = find(child, name)
            if (found) return found
        }
        return null
    }
    function icons(item) {
        let count = 0
        for (let i = 0; i < item.children.length; ++i) {
            const child = item.children[i]
            if (child instanceof Ui.Icon) ++count
            count += icons(child)
        }
        return count
    }

    // Rows in long lists build one field each, so a plain field must not
    // build the icon or the clear button it does not show.
    function test_plainFieldBuildsNoOptionalParts() {
        compare(find(plain, "textFieldClear"), null)
        compare(icons(plain), 0)
    }

    function test_clearButtonExistsOnlyWhileThereIsText() {
        compare(icons(search), 1)
        compare(find(search, "textFieldClear"), null)
        search.text = "query"
        const clear = find(search, "textFieldClear")
        verify(clear && clear.visible)
        committed.clear()
        mouseClick(clear)
        compare(search.text, "")
        compare(committed.count, 1)
        compare(committed.signalArguments[0][0], "")
        verify(search.activeFocus)
        tryVerify(() => find(search, "textFieldClear") === null)
    }
}

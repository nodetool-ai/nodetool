import QtQuick
import QtTest
import NodeTool.Timeline

Item {
    id: host
    width: 900
    height: 600
    DockLayoutStore { id: store }
    TestCase {
        name: "DockTabTitles"
        when: windowShown
        function findItem(item, predicate) {
            if (predicate(item)) return item
            for (const child of item.children || []) {
                const found = findItem(child, predicate)
                if (found) return found
            }
            return null
        }
        function test_truncatedTitleRevealsOnHoverAndKeyboardFocus() {
            store.switchWorkspace(0)
            store.resetWorkspace()
            const title = "A long descriptive panel title ".repeat(8)
            const registry = [{id: "program", title: title}, {id: "tracks", title: "Tracks"}]
            store.registerPanels(registry)
            const component = Qt.createComponent("../../../../qml/dock/DockCanvas.qml")
            compare(component.status, Component.Ready, component.errorString())
            const dock = createTemporaryObject(component, host, {
                store: store, registry: registry, availableIds: ["program", "tracks"],
                width: host.width, height: host.height
            })
            verify(dock, component.errorString())
            const tab = findChild(dock, "dockTab_program")
            verify(tab)
            verify(waitForRendering(tab))
            const caption = findItem(tab, item => item.text === title)
            verify(caption)
            verify(caption.truncated)
            mouseMove(tab, tab.width / 2, tab.height / 2)
            const tip = findChild(tab, "dockTabTitleTooltip")
            verify(tip)
            tryVerify(() => tip.visible, 1500)
            compare(tip.text, title)
            mouseMove(host, host.width - 1, host.height - 1)
            host.forceActiveFocus()
            tryVerify(() => !tip.visible)
            for (let i = 0; i < 20 && !tab.activeFocus; ++i) keyClick(Qt.Key_Tab)
            verify(tab.activeFocus)
            tryVerify(() => tip.visible, 1500)
            dock.registry = [{id: "program", title: "Short"}, {id: "tracks", title: "Tracks"}]
            tryVerify(() => !tip.visible)
            dock.destroy()
            wait(0)
        }
    }
}

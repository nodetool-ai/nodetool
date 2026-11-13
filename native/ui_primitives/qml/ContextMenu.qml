import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Basic.Menu {
    id: root
    property Item returnFocusTo: null
    parent: Basic.Overlay.overlay
    padding: Metrics.xs
    // A menu taller than the window scrolls inside it.
    margins: 0
    // Closed menus can lose items during destruction. Only enumerate a live menu,
    // with delayed measurements owned and cancelled by its lifecycle.
    property real widestItem: 0
    property bool destroying: false
    function measureItems() {
        let widest = 0
        for (let index = 0; index < count; ++index) {
            const item = itemAt(index)
            if (item) widest = Math.max(widest, item.implicitWidth)
        }
        widestItem = widest
    }
    Timer {
        id: measurement
        interval: 0
        onTriggered: if (root.visible && !root.destroying) root.measureItems()
    }
    onCountChanged: if (visible && !destroying) measurement.restart()
    onAboutToShow: if (!destroying) measureItems()
    Component.onDestruction: {
        destroying = true
        measurement.stop()
    }
    implicitWidth: {
        const desired = widestItem + leftPadding + rightPadding
        return parent ? Math.min(desired, parent.width) : desired
    }
    function openAt(item) {
        returnFocusTo = item
        const point = item.mapToItem(parent, 0, item.height)
        x = Math.max(0, Math.min(point.x, parent.width - width))
        y = Math.max(0, Math.min(point.y + height <= parent.height ? point.y : point.y - item.height - height, parent.height - height))
        open()
    }
    // Opens at a point of `item`, as a right-click on it wants. The window keeps the whole menu.
    function popupAt(item, itemX, itemY) {
        const point = item.mapToItem(parent, itemX, itemY)
        x = Math.max(0, Math.min(point.x, parent.width - width))
        y = Math.max(0, Math.min(point.y, parent.height - height))
        open()
    }
    delegate: Ui.MenuItem {}

    // Entry list. Each entry is a map with an id, label, icon, shortcut, tooltip,
    // reason, enabled, destructive and checked. A map with `submenu` holds a nested
    // list, one with only `separator: true` is a divider and one with only `header`
    // is a section label. A chosen entry emits entryTriggered(id). Items get the
    // objectName "menu-item-<id>" and a submenu "menu-<id>". Setting `entries`
    // rebuilds the menu, also while it is open.
    property var entries: []
    property real submenuMinimumWidth: Metrics.xxxl * 5.625
    property var itemsById: ({})
    property bool entriesBuilt: false
    signal entryTriggered(string id)
    function itemFor(id) {
        return itemsById[id] !== undefined ? itemsById[id] : null
    }
    function rebuild() {
        entriesBuilt = true
        buildEntries(root, entries)
    }
    onEntriesChanged: if (entriesBuilt || (entries && entries.length > 0)) rebuild()
    Component.onCompleted: if (entries && entries.length > 0) rebuild()
    function buildEntries(target, list) {
        while (target.count > 0) {
            const stale = target.itemAt(0)
            target.removeItem(stale)
            stale.destroy()
        }
        if (target === root) {
            itemsById = ({})
        }
        for (let index = 0; index < list.length; ++index) {
            const entry = list[index]
            if (entry.separator === true) {
                target.addItem(separatorComponent.createObject(null))
            } else if (entry.header !== undefined) {
                target.addItem(headerComponent.createObject(null, { text: entry.header }))
            } else if (entry.submenu !== undefined) {
                addSubmenu(target, entry)
            } else {
                const row = itemComponent.createObject(null, entryProperties(entry))
                row.triggered.connect(() => root.entryTriggered(entry.id))
                target.addItem(row)
                itemsById[entry.id] = row
            }
        }
    }
    function entryProperties(entry) {
        const checkable = entry.checked !== undefined
        return {
            objectName: "menu-item-" + entry.id,
            text: entry.label,
            iconName: entry.icon !== undefined ? entry.icon : "",
            shortcutText: entry.shortcut !== undefined ? entry.shortcut : "",
            reasonText: entry.reason !== undefined ? entry.reason : "",
            tip: entry.tooltip !== undefined ? entry.tooltip : "",
            enabled: entry.enabled !== false,
            checkable: checkable,
            checked: checkable && entry.checked === true,
            textTone: entry.destructive === true ? Ui.Text.Error : Ui.Text.Primary,
            iconTone: entry.destructive === true ? Ui.Text.Error : Ui.Text.Secondary
        }
    }
    function addSubmenu(target, entry) {
        const sub = submenuComponent.createObject(null, { title: entry.label, objectName: "menu-" + entry.id })
        buildEntries(sub, entry.submenu)
        target.addMenu(sub)
        const row = target.itemAt(target.count - 1)
        row.objectName = "menu-item-" + entry.id
        row.iconName = entry.icon !== undefined ? entry.icon : ""
        row.iconTone = Ui.Text.Secondary
        row.reasonText = entry.reason !== undefined ? entry.reason : ""
        row.enabled = entry.enabled !== false
        itemsById[entry.id] = row
        itemsById["menu-" + entry.id] = sub
    }
    Component {
        id: itemComponent
        Ui.MenuItem {
            id: row
            property string tip: ""
            Ui.Tooltip {
                trigger: row
                visible: row.tip !== "" && row.hovered
                text: row.tip
            }
        }
    }
    Component {
        id: submenuComponent
        Ui.ContextMenu {
            // A submenu is positioned by its parent item, not by the window.
            parent: null
            width: Math.max(root.submenuMinimumWidth, implicitWidth)
        }
    }
    Component { id: separatorComponent; Ui.MenuSeparator {} }
    Component { id: headerComponent; Ui.MenuHeader {} }
    background: Rectangle { color: Theme.surfaceOverlay; radius: Metrics.radiusOverlay; border.width: Metrics.border; border.color: Theme.borderControl }
    onClosed: {
        measurement.stop()
        if (returnFocusTo && returnFocusTo.visible && returnFocusTo.enabled) returnFocusTo.forceActiveFocus(Qt.PopupFocusReason)
    }
}

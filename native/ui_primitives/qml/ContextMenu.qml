import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Basic.Menu {
    id: root
    property Item returnFocusTo: null
    property Item popupAnchor: null
    onPopupAnchorChanged: if (!popupAnchor && visible) close()
    Connections {
        target: root.popupAnchor
        function onVisibleChanged() { if (root.popupAnchor && !root.popupAnchor.visible) root.close() }
    }
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
    onAboutToShow: {
        if (!destroying) {
            if (entriesBuilt || (entries && entries.length > 0)) rebuild()
            measureItems()
        }
    }
    Component.onDestruction: {
        destroying = true
        measurement.stop()
        retargeting.stop()
        pendingTarget = null
    }
    implicitWidth: {
        const desired = widestItem + leftPadding + rightPadding
        return parent ? Math.min(desired, parent.width) : desired
    }
    property Item pendingAnchor: null
    component RetargetRequest: QtObject { signal configure(Item anchor) }
    Component { id: retargetRequest; RetargetRequest {} }
    property RetargetRequest pendingTarget: null
    function cancelRetarget() {
        retargeting.stop()
        pendingAnchor = null
        if (pendingTarget) pendingTarget.destroy()
        pendingTarget = null
    }
    // Finish closing before replacing a shared menu's target, including during exit.
    function retarget(anchor, configure) {
        cancelRetarget()
        if (!visible) {
            configure(anchor)
            return
        }
        pendingAnchor = anchor
        pendingTarget = retargetRequest.createObject(root)
        pendingTarget.configure.connect(configure)
        close()
    }
    Timer {
        id: retargeting
        interval: 0
        onTriggered: {
            const anchor = root.pendingAnchor
            const request = root.pendingTarget
            root.pendingAnchor = null
            root.pendingTarget = null
            if (request) {
                if (anchor) request.configure(anchor)
                request.destroy()
            }
        }
    }
    function openAt(item) {
        popupAnchor = item
        returnFocusTo = item
        open()
        measureItems()
        const point = item.mapToItem(parent, 0, item.height)
        x = Math.max(0, Math.min(point.x, parent.width - width))
        y = Math.max(0, Math.min(point.y + height <= parent.height ? point.y : point.y - item.height - height, parent.height - height))
    }
    // Opens at a point of `item`, as a right-click on it wants. The window keeps the whole menu.
    function popupAt(item, itemX, itemY) {
        popupAnchor = item
        returnFocusTo = null
        open()
        measureItems()
        const point = item.mapToItem(parent, itemX, itemY)
        x = Math.max(0, Math.min(point.x, parent.width - width))
        y = Math.max(0, Math.min(point.y, parent.height - height))
    }
    delegate: Ui.MenuItem {}

    // Entry list. Each entry is a map with an id, label, icon, shortcut, tooltip,
    // reason, enabled, destructive and checked. A map with `submenu` holds a nested
    // list, one with only `separator: true` is a divider and one with only `header`
    // is a section label. A chosen entry emits entryTriggered(id). Items get the
    // objectName "menu-item-<id>" and a submenu "menu-<id>". Setting `entries`
    // rebuilds the menu while open. Closed data menus have count 0 and itemFor()
    // returns null. They read the latest entries on open.
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
    onEntriesChanged: if (visible) rebuild()
    function buildEntries(target, list) {
        // removeItem and removeMenu destroy what they remove, so nothing is destroyed twice.
        while (target.count > 0) {
            const stale = target.itemAt(0)
            if (stale.subMenu) target.removeMenu(stale.subMenu)
            else target.removeItem(stale)
        }
        if (target === root) {
            itemsById = ({})
        }
        for (let index = 0; index < list.length; ++index) {
            const entry = list[index]
            if (entry.separator === true) {
                target.addItem(separatorComponent.createObject(target))
            } else if (entry.header !== undefined) {
                target.addItem(headerComponent.createObject(target, { text: entry.header }))
            } else if (entry.submenu !== undefined) {
                addSubmenu(target, entry)
            } else {
                const row = itemComponent.createObject(target, entryProperties(entry))
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
        const sub = submenuComponent.createObject(null, { parent: null, title: entry.label, objectName: "menu-" + entry.id, submenuMinimumWidth: root.submenuMinimumWidth })
        sub.width = Qt.binding(function() { return Math.max(root.submenuMinimumWidth, sub.implicitWidth) })
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
    // A submenu is another ContextMenu. QML rejects a type that declares itself,
    // so the submenu is created from the file at run time.
    readonly property Component submenuComponent: Qt.createComponent("ContextMenu.qml")
    Component { id: separatorComponent; Ui.MenuSeparator {} }
    Component { id: headerComponent; Ui.MenuHeader {} }
    background: Rectangle { color: Theme.surfaceOverlay; radius: Metrics.radiusOverlay; border.width: Metrics.border; border.color: Theme.borderControl }
    onClosed: {
        measurement.stop()
        if (entriesBuilt) {
            buildEntries(root, [])
            entriesBuilt = false
        }
        if (returnFocusTo && returnFocusTo.visible && returnFocusTo.enabled) returnFocusTo.forceActiveFocus(Qt.PopupFocusReason)
        returnFocusTo = null
        popupAnchor = null
        if (pendingTarget) retargeting.restart()
    }
}

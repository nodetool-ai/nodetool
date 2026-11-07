import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// Editor context menu. It fills a transparent overlay widget, so a submenu can
// open past the first menu's edge. The host builds the entries; each one is a
// map with an id, label, iconName, shortcut, tooltip, reason, enabled,
// destructive, and for a submenu a nested list. A map with only
// `separator: true` is a divider, and one with only `header` is a section label.
Item {
    id: root
    required property var dispatch
    property var entries: []
    property var itemsById: ({})
    readonly property real paneWidth: Ui.Metrics.xxxl * 7.5
    readonly property real minimumWidth: Ui.Metrics.xxxl * 5.625
    property real menuWidth: minimumWidth
    readonly property alias menu: menu

    function itemFor(id) {
        return itemsById[id] !== undefined ? itemsById[id] : null
    }
    function popupAt(x, y) {
        build(menu, entries)
        menu.popupAt(root, x, y)
        menu.forceActiveFocus(Qt.PopupFocusReason)
    }
    function build(target, list) {
        while (target.count > 0) {
            const stale = target.itemAt(0)
            target.removeItem(stale)
            stale.destroy()
        }
        if (target === menu) {
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
                const row = itemComponent.createObject(null, properties(entry))
                row.triggered.connect(() => root.dispatch.choose(entry.id))
                target.addItem(row)
                itemsById[entry.id] = row
            }
        }
    }
    function properties(entry) {
        return {
            objectName: "menu-item-" + entry.id,
            text: entry.label,
            iconName: entry.icon !== undefined ? entry.icon : "",
            shortcutText: entry.shortcut !== undefined ? entry.shortcut : "",
            reasonText: entry.reason !== undefined ? entry.reason : "",
            tip: entry.tooltip !== undefined ? entry.tooltip : "",
            enabled: entry.enabled !== false,
            textTone: entry.destructive === true ? Ui.Text.Error : Ui.Text.Primary,
            iconTone: entry.destructive === true ? Ui.Text.Error : Ui.Text.Secondary
        }
    }
    function addSubmenu(target, entry) {
        const sub = submenuComponent.createObject(null, { title: entry.label, objectName: "menu-" + entry.id })
        build(sub, entry.submenu)
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

    Ui.ContextMenu {
        id: menu
        objectName: "context-menu"
        closePolicy: Basic.Popup.CloseOnEscape | Basic.Popup.CloseOnPressOutside
        width: Math.max(root.menuWidth, implicitWidth)
        onClosed: root.dispatch.choose("")
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
            // A submenu is positioned by its parent item, not by the overlay.
            parent: null
            width: Math.max(root.minimumWidth, implicitWidth)
        }
    }
    Component {
        id: separatorComponent
        Basic.MenuSeparator {
            padding: Ui.Metrics.xs
            contentItem: Ui.Separator {}
        }
    }
    Component {
        id: headerComponent
        Basic.MenuItem {
            enabled: false
            hoverEnabled: false
            leftPadding: Ui.Metrics.md
            rightPadding: Ui.Metrics.md
            implicitHeight: Ui.Metrics.compact
            contentItem: Ui.Text {
                text: parent.text
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                verticalAlignment: Text.AlignVCenter
            }
            background: null
        }
    }
}

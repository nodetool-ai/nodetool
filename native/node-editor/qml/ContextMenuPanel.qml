import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// Editor context menu. It fills a transparent overlay widget, so a submenu can
// open past the first menu's edge. The host builds the entries (see
// Ui.ContextMenu.entries) and dispatch.choose receives the chosen id, or an
// empty string when the menu closes without a choice. Setting `entries` while
// the menu is open rebuilds it.
Item {
    id: root
    required property var dispatch
    property var entries: []
    readonly property real paneWidth: Ui.Metrics.xxxl * 7.5
    readonly property real minimumWidth: Ui.Metrics.xxxl * 5.625
    property real menuWidth: minimumWidth
    readonly property alias menu: menu

    function itemFor(id) {
        return menu.itemFor(id)
    }
    function dismiss() {
        menu.close()
    }
    function popupAt(x, y) {
        menu.rebuild()
        menu.popupAt(root, x, y)
        menu.forceActiveFocus(Qt.PopupFocusReason)
    }

    Ui.ContextMenu {
        id: menu
        objectName: "context-menu"
        entries: root.entries
        submenuMinimumWidth: root.minimumWidth
        closePolicy: Basic.Popup.CloseOnEscape | Basic.Popup.CloseOnPressOutside
        width: Math.max(root.menuWidth, implicitWidth)
        onEntryTriggered: id => root.dispatch.choose(id)
        onClosed: root.dispatch.choose("")
    }
}

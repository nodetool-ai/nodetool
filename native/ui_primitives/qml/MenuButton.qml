import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    id: root
    property Component menuComponent: null
    property var menu: lazyMenu.item
    Loader { id: lazyMenu; active: false; sourceComponent: root.menuComponent }
    function openMenu() {
        if (!menu && menuComponent) lazyMenu.active = true
        if (!menu) return
        if (menu.visible) menu.close()
        else if (typeof menu.openAt === "function") menu.openAt(root)
        else menu.open()
    }
    Keys.onDownPressed: event => {
        if (enabled && !loading) openMenu()
        event.accepted = true
    }
    menuButton: true
    menuExpanded: menu !== null && menu.visible
    trailingIconName: "arrowDropDown"
    onClicked: openMenu()
    Connections {
        target: root.menu
        function onClosed() { if (root.visible && root.enabled) root.forceActiveFocus(Qt.PopupFocusReason) }
    }
}

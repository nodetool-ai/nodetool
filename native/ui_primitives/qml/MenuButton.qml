import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    id: root
    property var menu: null
    menuButton: true
    menuExpanded: menu !== null && menu.visible
    trailingIconName: "arrowDropDown"
    onClicked: {
        if (menu === null) return
        if (menu.visible) menu.close()
        else if (typeof menu.openAt === "function") menu.openAt(root)
        else menu.open()
    }
    Connections {
        target: root.menu
        function onClosed() { if (root.visible && root.enabled) root.forceActiveFocus(Qt.PopupFocusReason) }
    }
}

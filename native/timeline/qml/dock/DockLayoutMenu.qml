import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline

ToolButton {
    id: root
    required property DockLayoutStore store
    required property var panels
    objectName: "dockLayoutMenu"
    label: store.workspace
    iconPath: Icons.arrowDropDown
    onClicked: menu.popup()
    Controls.Menu {
        id: menu
        implicitWidth: Math.max(180, contentChildren.reduce((size, item) => Math.max(size, item.implicitWidth), 0)) + leftPadding + rightPadding
        popupType: Controls.Popup.Item
        y: root.height
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        palette.window: Theme.backgroundPaper
        palette.text: Theme.textPrimary
        palette.windowText: Theme.textPrimary
        palette.highlight: Theme.actionSelected
        palette.highlightedText: Theme.textPrimary
        background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusLg }
        Controls.MenuItem { text: "Workspaces"; enabled: false }
        Instantiator {
            onObjectAdded: (index, object) => menu.insertItem(index + 1, object)
            onObjectRemoved: (index, object) => menu.removeItem(object)
            model: root.store.workspaces
            delegate: Controls.MenuItem {
                required property string modelData
                required property int index
                objectName: "dockWorkspace_" + modelData
                text: modelData + "    Alt+Shift+" + (index + 1)
                checkable: true
                checked: root.store.workspace === modelData
                onTriggered: root.store.switchWorkspace(index)
            }
        }
        Controls.MenuSeparator {}
        Controls.MenuItem { objectName: "dockResetWorkspace"; text: "Reset to saved layout"; onTriggered: root.store.resetWorkspace() }
        Controls.MenuSeparator {}
        Controls.MenuItem { text: "Panels"; enabled: false }
        Instantiator {
            onObjectAdded: (index, object) => menu.addItem(object)
            onObjectRemoved: (index, object) => menu.removeItem(object)
            model: root.panels
            delegate: Controls.MenuItem {
                required property var modelData
                objectName: "dockToggle_" + modelData.id
                text: modelData.title
                checkable: true
                checked: root.store.layout.hidden.indexOf(modelData.id) < 0
                enabled: modelData.id !== "program" && modelData.id !== "tracks"
                onTriggered: root.store.dispatch({type: checked ? "reveal" : "hide", panelId: modelData.id})
            }
        }
    }
}

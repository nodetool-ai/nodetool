import QtQuick
import QtQuick.Window
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

ToolButton {
    id: root
    required property DockLayoutStore store
    required property var panels
    objectName: "dockLayoutMenu"
    label: store.workspace
    iconName: "arrowDropDown"
    onClicked: layoutPopup.openAt(root)
    Ui.ContextMenu {
        id: layoutPopup
        objectName: "dockWorkspacePopup"
        width: Math.min(root.Window.window ? root.Window.window.width : TimelineMetrics.dockMenuWidth, TimelineMetrics.dockMenuWidth)
        popupType: Controls.Popup.Item
        Ui.MenuItem { text: "Workspaces"; enabled: false }
        Instantiator {
            onObjectAdded: (index, object) => layoutPopup.insertItem(index + 1, object)
            onObjectRemoved: (index, object) => layoutPopup.removeItem(object)
            model: root.store.workspaces
            delegate: Ui.MenuItem {
                required property string modelData
                required property int index
                width: layoutPopup.availableWidth
                height: implicitHeight
                objectName: "dockWorkspace_" + modelData
                text: modelData
                shortcutText: "Alt+Shift+" + (index + 1)
                checkable: true
                checked: root.store.workspace === modelData
                onTriggered: root.store.switchWorkspace(index)
            }
        }
        Controls.MenuSeparator { contentItem: Ui.Separator {} }
        Ui.MenuItem { objectName: "dockResetWorkspace"; text: "Reset to saved layout"; onTriggered: root.store.resetWorkspace() }
        Controls.MenuSeparator { contentItem: Ui.Separator {} }
        Ui.MenuItem { text: "Panels"; enabled: false }
        Instantiator {
            onObjectAdded: (index, object) => layoutPopup.addItem(object)
            onObjectRemoved: (index, object) => layoutPopup.removeItem(object)
            model: root.panels
            delegate: Ui.MenuItem {
                required property var modelData
                width: layoutPopup.availableWidth
                height: implicitHeight
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

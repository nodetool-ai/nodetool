pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline

Rectangle {
    id: root
    required property var dock
    required property var group
    required property string region
    readonly property var eligible: group.panels.filter(id => dock.shown(id))
    readonly property string activePanelId: eligible.indexOf(group.activePanelId) >= 0 ? group.activePanelId : (eligible[0] || "")
    property string menuPanel: ""
    objectName: "dockGroup_" + group.id
    color: Theme.backgroundPaper
    clip: true
    function openMenu(id) { menuPanel = id; menu.popup(0, tabs.height) }
    function tabTarget(x, dragged) { return tabs.insertionIndex(x, dragged) }
    function trackSlot() { if (dock && group) dock.registerSlot(group.id, body) }
    onGroupChanged: trackSlot()
    Component.onCompleted: trackSlot()
    Component.onDestruction: if (dock) dock.unregisterSlot(group.id, body)
    onXChanged: dock.noteGeometry()
    onYChanged: dock.noteGeometry()
    onWidthChanged: dock.noteGeometry()
    onHeightChanged: dock.noteGeometry()
    DockTabStrip {
        id: tabs
        width: parent.width
        height: implicitHeight
        dock: root.dock
        groupView: root
        panels: root.eligible
        activeId: root.activePanelId
    }
    Item {
        id: body
        property var groupView: root
        anchors.top: tabs.bottom
        anchors.bottom: parent.bottom
        width: parent.width
        Accessible.role: Accessible.Pane
        Accessible.name: root.dock.title(root.activePanelId)
        DockPanelHeader { title: root.dock.title(root.activePanelId); width: parent.width; height: implicitHeight }
    }
    Controls.Menu {
        id: menu
        implicitWidth: Math.max(180, contentChildren.reduce((size, item) => Math.max(size, item.implicitWidth), 0)) + leftPadding + rightPadding
        popupType: Controls.Popup.Item
        palette.window: Theme.backgroundPaper
        palette.text: Theme.textPrimary
        palette.windowText: Theme.textPrimary
        palette.highlight: Theme.actionSelected
        palette.highlightedText: Theme.textPrimary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusLg }
        Controls.MenuItem {
            text: "Close " + root.dock.title(root.menuPanel)
            enabled: root.menuPanel !== "program" && root.menuPanel !== "tracks"
            onTriggered: root.dock.store.dispatch({type: "hide", panelId: root.menuPanel})
        }
        Controls.MenuItem {
            text: root.dock.maximizedGroup ? "Restore layout" : "Maximize group"
            onTriggered: root.dock.toggleMaximize(root.group.id)
        }
        Controls.MenuItem {
            text: root.region === "left" || root.region === "right" ? "Split below" : "Split right"
            enabled: root.eligible.length > 1
            onTriggered: root.dock.dropPanel(root.menuPanel, {kind: "zone", region: root.region, groupId: root.group.id,
                zone: root.region === "left" || root.region === "right" ? "bottom" : "right"})
        }
        Controls.MenuItem {
            text: "Move tab left"
            enabled: root.eligible.indexOf(root.menuPanel) > 0
            onTriggered: root.dock.dropPanel(root.menuPanel, {kind: "tab", region: root.region, groupId: root.group.id, index: root.eligible.indexOf(root.menuPanel) - 1})
        }
        Controls.MenuItem {
            text: "Move tab right"
            enabled: root.eligible.indexOf(root.menuPanel) < root.eligible.length - 1
            onTriggered: root.dock.dropPanel(root.menuPanel, {kind: "tab", region: root.region, groupId: root.group.id, index: root.eligible.indexOf(root.menuPanel) + 1})
        }
        Controls.MenuSeparator {}
        Instantiator {
            onObjectAdded: (index, object) => menu.addItem(object)
            onObjectRemoved: (index, object) => menu.removeItem(object)
            model: ["left", "right", "bottom", "viewport"]
            delegate: Controls.MenuItem {
                required property string modelData
                text: "Move to " + modelData + " dock"
                enabled: modelData !== root.region
                onTriggered: root.dock.moveToRegion(root.menuPanel, modelData)
            }
        }
    }
}

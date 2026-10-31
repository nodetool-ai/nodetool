pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: root
    required property var dock
    required property var groupView
    required property var panels
    required property string activeId
    implicitHeight: Theme.rulerHeight
    color: Theme.backgroundDefault
    clip: true
    function insertionIndex(x, dragged) {
        let index = 0
        for (let i = 0; i < tabs.count; ++i) {
            const tab = tabs.itemAt(i)
            if (tab.panelId === dragged) continue
            if (x + tabViewport.contentX < tab.x + tab.width / 2) return index
            ++index
        }
        return index
    }
    function focusTab(index) {
        const tab = tabs.itemAt((index + tabs.count) % tabs.count)
        if (!tab) return
        root.dock.store.dispatch({type: "activate", panelId: tab.panelId})
        tab.forceActiveFocus()
        tabViewport.contentX = Math.max(0, Math.min(tab.x, tabViewport.contentWidth - tabViewport.width))
    }
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.divider }
    Flickable {
        id: tabViewport
        width: parent.width - options.width
        height: parent.height
        contentWidth: tabRow.width
        contentHeight: height
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.HorizontalFlick
        Row {
            id: tabRow
            height: parent.height
            Repeater {
                id: tabs
                model: root.panels.length
                delegate: Rectangle {
                    id: tab
                    required property int index
                    readonly property string panelId: root.panels[index]
                    readonly property bool selected: root.activeId === panelId
                    readonly property bool closable: panelId !== "program" && panelId !== "tracks"
                    objectName: "dockTab_" + panelId
                    width: Math.min(200, title.implicitWidth + Theme.spacingMd * 2 + (closable ? Theme.controlXs : 0))
                    height: root.height
                    color: selected ? Theme.backgroundPaper : hover.containsMouse ? Theme.actionHover : Theme.backgroundDefault
                    activeFocusOnTab: selected
                    Accessible.role: Accessible.PageTab
                    Accessible.name: root.dock.title(panelId)
                    Accessible.selected: selected
                    Text {
                        id: title
                        x: Theme.spacingMd
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - x * 2 - (tab.closable ? Theme.controlXs : 0)
                        text: root.dock.title(tab.panelId)
                        elide: Text.ElideRight
                        color: tab.selected ? Theme.textPrimary : Theme.textSecondary
                        font.family: Theme.sansFamily
                        font.pixelSize: Theme.fontSizeSmall
                        font.weight: Font.Medium
                    }
                    Rectangle { anchors.right: parent.right; width: 1; height: parent.height; color: Theme.divider }
                    Rectangle { width: parent.width; height: Theme.spacingMicro; color: tab.activeFocus ? Theme.primary : Theme.actionDisabled; visible: tab.selected }
                    MouseArea {
                        id: hover
                        anchors.fill: parent
                        hoverEnabled: true
                        acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
                        preventStealing: true
                        property point start
                        property bool dragged: false
                        onPressed: event => {
                            start = mapToItem(root.dock, event.x, event.y)
                            dragged = false
                            if (event.button === Qt.LeftButton) root.dock.store.dispatch({type: "activate", panelId: tab.panelId})
                        }
                        onPositionChanged: event => {
                            if (!pressed || !(pressedButtons & Qt.LeftButton)) return
                            const point = mapToItem(root.dock, event.x, event.y)
                            if (!dragged && Math.hypot(point.x - start.x, point.y - start.y) >= Theme.spacingXs) {
                                dragged = true
                                root.dock.beginDrag(tab.panelId)
                            }
                            if (dragged) root.dock.updateDrag(point.x, point.y)
                        }
                        onReleased: event => {
                            if (dragged) root.dock.finishDrag()
                            else if (event.button === Qt.MiddleButton && tab.closable) root.dock.store.dispatch({type: "hide", panelId: tab.panelId})
                            else if (event.button === Qt.RightButton) root.groupView.openMenu(tab.panelId)
                            else tab.forceActiveFocus()
                        }
                        onCanceled: root.dock.cancelDrag()
                    }
                    PanelButton {
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        width: Theme.iconSm
                        height: Theme.iconSm
                        text: "Close " + root.dock.title(tab.panelId)
                        iconPath: Icons.closeOutlined
                        iconOnly: true
                        visible: tab.closable && (tab.selected || hover.containsMouse)
                        focusPolicy: Qt.NoFocus
                        onClicked: root.dock.store.dispatch({type: "hide", panelId: tab.panelId})
                    }
                    Keys.onPressed: event => {
                        if (event.key === Qt.Key_Right) root.focusTab(index + 1)
                        else if (event.key === Qt.Key_Left) root.focusTab(index - 1)
                        else if (event.key === Qt.Key_Home) root.focusTab(0)
                        else if (event.key === Qt.Key_End) root.focusTab(tabs.count - 1)
                        else if ((event.key === Qt.Key_Delete || event.key === Qt.Key_Backspace) && closable) root.dock.store.dispatch({type: "hide", panelId})
                        else if (event.key === Qt.Key_Menu || (event.key === Qt.Key_F10 && event.modifiers & Qt.ShiftModifier)) root.groupView.openMenu(panelId)
                        else if (event.key === Qt.Key_Space && event.modifiers & Qt.ShiftModifier) root.dock.toggleMaximize(root.groupView.group.id)
                        else return
                        event.accepted = true
                    }
                }
            }
        }
    }
    PanelButton {
        id: options
        anchors.right: parent.right
        text: "Panel options"
        iconOnly: true
        iconPath: Icons.moreVert
        onClicked: root.groupView.openMenu(root.activeId)
    }
}

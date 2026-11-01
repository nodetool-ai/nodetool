pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property var dock
    required property var groupView
    required property var panels
    required property string activeId
    implicitHeight: Math.max(Ui.Metrics.compact,
        Ui.Typography.pixelSize(Ui.Typography.SansLabel) * Ui.Typography.lineHeight(Ui.Typography.SansLabel) + 2 * Ui.Metrics.md)
    color: Ui.Theme.surfaceCanvas
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
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: Ui.Metrics.border; color: Ui.Theme.borderSubtle }
    Flickable {
        id: tabViewport
        width: parent.width - options.width - maximize.width
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
                    readonly property bool showClose: closable && selected
                    objectName: "dockTab_" + panelId
                    width: Math.min(Ui.Metrics.small * 10 + Ui.Metrics.md,
                        title.implicitWidth + Ui.Metrics.md * 2 + (glyph.visible ? glyph.width + Ui.Metrics.sm : 0) + (showClose ? Ui.Metrics.compact : 0))
                    // Inactive tabs stop above the strip's bottom border. The selected tab covers it and joins its panel.
                    height: selected ? root.height : root.height - Ui.Metrics.border
                    color: selected ? Ui.Theme.surfacePanel : hover.containsMouse ? Ui.Theme.actionHover : Ui.Theme.surfaceCanvas
                    activeFocusOnTab: selected
                    Accessible.role: Accessible.PageTab
                    Accessible.name: root.dock.title(panelId)
                    Accessible.selected: selected
                    Accessible.onPressAction: tab.activate()
                    function activate() {
                        root.dock.store.dispatch({type: "activate", panelId: panelId})
                        forceActiveFocus()
                    }
                    Ui.Icon {
                        id: glyph
                        x: Ui.Metrics.md
                        anchors.verticalCenter: parent.verticalCenter
                        name: root.dock.icon(tab.panelId)
                        visible: name !== ""
                        tone: tab.selected ? Ui.Text.Primary : Ui.Text.Secondary
                    }
                    Ui.Text {
                        id: title
                        x: glyph.visible ? glyph.x + glyph.width + Ui.Metrics.sm : Ui.Metrics.md
                        anchors.verticalCenter: parent.verticalCenter
                        width: parent.width - x - Ui.Metrics.md - (tab.showClose ? Ui.Metrics.compact : 0)
                        text: root.dock.title(tab.panelId)
                        elide: Text.ElideRight
                        role: Ui.Typography.SansLabel
                        tone: tab.selected ? Ui.Text.Primary : Ui.Text.Secondary
                    }
                    Rectangle { anchors.right: parent.right; width: Ui.Metrics.border; height: parent.height; color: Ui.Theme.borderSubtle }
                    Rectangle { width: parent.width; height: Ui.Metrics.micro; color: tab.activeFocus ? Ui.Theme.accentPrimary : Ui.Theme.actionDisabled; visible: tab.selected }
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
                            if (event.button === Qt.LeftButton) tab.activate()
                        }
                        onPositionChanged: event => {
                            if (!pressed || !(pressedButtons & Qt.LeftButton)) return
                            const point = mapToItem(root.dock, event.x, event.y)
                            if (!dragged && Math.hypot(point.x - start.x, point.y - start.y) >= Ui.Metrics.xs) {
                                dragged = true
                                root.dock.beginDrag(tab.panelId)
                            }
                            if (dragged) root.dock.updateDrag(point.x, point.y)
                        }
                        onReleased: event => {
                            if (dragged) root.dock.finishDrag()
                            else if (event.button === Qt.MiddleButton && tab.closable) root.dock.store.dispatch({type: "hide", panelId: tab.panelId})
                            else if (event.button === Qt.RightButton) root.groupView.openMenu(tab.panelId, tab)
                            else tab.forceActiveFocus()
                        }
                        onCanceled: root.dock.cancelDrag()
                    }
                    Ui.ToolbarIconButton {
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        iconName: "close"
                        accessibleName: "Close " + root.dock.title(tab.panelId)
                        visible: tab.showClose
                        focusPolicy: Qt.NoFocus
                        onClicked: root.dock.store.dispatch({type: "hide", panelId: tab.panelId})
                    }
                    Keys.onPressed: event => {
                        if (event.key === Qt.Key_Right) root.focusTab(index + 1)
                        else if (event.key === Qt.Key_Left) root.focusTab(index - 1)
                        else if (event.key === Qt.Key_Home) root.focusTab(0)
                        else if (event.key === Qt.Key_End) root.focusTab(tabs.count - 1)
                        else if ((event.key === Qt.Key_Delete || event.key === Qt.Key_Backspace) && closable) root.dock.store.dispatch({type: "hide", panelId})
                        else if (event.key === Qt.Key_Menu || (event.key === Qt.Key_F10 && event.modifiers & Qt.ShiftModifier)) root.groupView.openMenu(panelId, tab)
                        else if (event.key === Qt.Key_Space && event.modifiers & Qt.ShiftModifier) root.dock.toggleMaximize(root.groupView.group.id)
                        else if (event.modifiers === Qt.NoModifier && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter || event.key === Qt.Key_Space)) tab.activate()
                        else return
                        event.accepted = true
                    }
                }
            }
        }
    }
    ToolButton {
        id: maximize
        objectName: "dockMaximize"
        anchors.right: options.left
        readonly property bool maximized: !!root.groupView && !!root.groupView.group && root.dock.maximizedGroup === root.groupView.group.id
        label: maximized ? "Restore layout" : "Maximize panel"
        iconOnly: true
        iconName: maximized ? "fullscreenExit" : "fullscreen"
        onClicked: root.dock.toggleMaximize(root.groupView.group.id)
    }
    ToolButton {
        id: options
        objectName: root.groupView && root.groupView.group ? "dockPanelOptions_" + root.groupView.group.id : ""
        anchors.right: parent.right
        label: "Panel options"
        iconOnly: true
        iconName: "moreVert"
        onClicked: root.groupView.openMenu(root.activeId, options, true)
    }
}

import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// Workspace tabs follow web/src/components/workspace/WorkspaceTabBar.tsx and
// WorkspaceTabItem.tsx. Each tab hosts its own strip, so the scroll offset is
// kept by the window.
Rectangle {
    id: root
    EditorRoles {
        id: roles
    }
    required property DocumentTabs tabs
    required property Notifications notifications
    color: roles.chrome
    implicitHeight: roles.tabHeight

    // The buttons beside the tabs route their hints through the interface, because
    // a QML tooltip cannot leave the strip's window, which is only as tall as the strip.
    // Leaving one control after entering the next keeps the next one's hint.
    function hint(item, text, delay) {
        if (text === "" && tooltipTimer.owner !== item) {
            return;
        }
        unhint();
        if (text === "") {
            return;
        }
        tooltipTimer.owner = item;
        tooltipTimer.text = text;
        tooltipTimer.at = item.mapToGlobal(0, item.height);
        tooltipTimer.interval = delay;
        tooltipTimer.start();
    }
    function unhint() {
        tooltipTimer.stop();
        tooltipTimer.owner = null;
        root.tabs.showToolTip("", Qt.point(0, 0));
    }
    Timer {
        id: tooltipTimer
        property Item owner: null
        property string text: ""
        property point at
        onTriggered: {
            root.tabs.showToolTip(text, at);
        }
    }
    Connections {
        target: root.tabs
        function onRenameStarted(index) {
            strip.renamingIndex = index;
        }
    }

    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: Ui.Metrics.border
        color: roles.divider
    }
    Row {
        id: bar
        height: parent.height
        Item {
            id: selector
            objectName: "project-selector"
            height: bar.height
            width: Math.min(roles.tabMaxWidth, selectorRow.implicitWidth + Ui.Metrics.lg * 2)
            activeFocusOnTab: true
            Accessible.role: Accessible.ButtonMenu
            Accessible.name: "Selected project: " + projectLabel.text
            Accessible.onPressAction: root.openProjects()
            Keys.onReturnPressed: root.openProjects()
            Keys.onSpacePressed: root.openProjects()
            HoverHandler {
                id: selectorHover
            }
            Rectangle {
                anchors.fill: parent
                color: selectorHover.hovered ? Ui.Theme.actionHover : "transparent"
            }
            RowLayout {
                id: selectorRow
                anchors.left: parent.left
                anchors.leftMargin: Ui.Metrics.lg
                anchors.right: parent.right
                anchors.rightMargin: Ui.Metrics.lg
                anchors.verticalCenter: parent.verticalCenter
                spacing: Ui.Metrics.md
                Ui.Text {
                    text: "◆"
                    role: Ui.Typography.SansLabel
                    domainColor: roles.projectAccent
                    Accessible.ignored: true
                }
                Ui.Text {
                    id: projectLabel
                    objectName: "project-name"
                    Layout.fillWidth: true
                    text: root.tabs.projectName
                    role: Ui.Typography.SansLabel
                    elide: Text.ElideRight
                }
                Ui.Icon {
                    name: "arrowDropDown"
                    size: Ui.Metrics.iconSm
                    tone: Ui.Text.Secondary
                }
            }
            MouseArea {
                objectName: "project-selector-button"
                anchors.fill: parent
                onClicked: root.openProjects()
            }
            Rectangle {
                anchors.right: parent.right
                width: Ui.Metrics.border
                height: parent.height
                color: roles.divider
            }
        }
        // The strip takes only the width its tabs need, so the new-tab button
        // follows the last tab and stays visible when the tabs overflow.
        Ui.DocumentTabStrip {
            id: strip
            objectName: "workflow-tab-strip"
            height: bar.height
            width: Math.max(0, Math.min(implicitWidth, root.width - selector.width - newTabSlot.width - rightActions.width - Ui.Metrics.xl))
            tabs: root.tabs.tabs.map(tab => Object.assign({busy: tab.running, modified: tab.dirty}, tab))
            currentIndex: root.tabs.activeTab
            scrollOffset: root.tabs.stripOffset
            reorderable: true
            minTabWidth: roles.tabMinWidth
            maxTabWidth: roles.tabMaxWidth
            titleTooltipDelay: roles.tabTitleTooltipDelay
            selectedColor: roles.canvas
            dividerColor: roles.divider
            busyLabel: "Running"
            renameLabel: "Tab name"
            objectNameFor: function (role, index) {
                switch (role) {
                case "tab": return "workflow-tab-" + index;
                case "activate": return "activate-tab-" + index;
                case "close": return "close-tab-" + index;
                case "title": return "tab-title";
                case "rename": return "tab-rename";
                case "busy": return "running-indicator";
                case "modified": return "unsaved-indicator";
                case "drop": return "drop-indicator";
                }
                return "";
            }
            accessibleNameFor: tab => tab.title + (tab.running ? ", running" : "") + (tab.dirty ? ", unsaved changes" : "")
            onScrolled: offset => root.tabs.scrollStrip(offset)
            onTabActivated: index => root.tabs.activateTab(index)
            onCloseRequested: index => root.tabs.closeTab(index)
            onContextMenuRequested: (index, position) => root.tabs.showTabMenu(index, position)
            onTabMoved: (from, to, after) => root.tabs.dropTab(from, to, after)
            onRenameCommitted: (index, title) => root.tabs.renameTab(index, title)
        }
        Item {
            id: newTabSlot
            height: bar.height
            width: newTab.implicitWidth + Ui.Metrics.xs * 2
            Ui.EditorButton {
                id: newTab
                objectName: "new-workflow-tab"
                anchors.centerIn: parent
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                iconName: "add"
                leftPadding: Ui.Metrics.sm
                rightPadding: Ui.Metrics.sm
                accessibleName: "New workflow tab"
                onHoveredChanged: root.hint(newTab, hovered ? accessibleName : "", Ui.Metrics.tooltipDelay)
                onPressed: root.unhint()
                onClicked: root.tabs.newTab()
            }
        }
    }
    // The notification bell and the settings button end the bar
    // (WorkspaceTabBar.tsx right-actions: 28 px buttons, 4 px apart and from the edge).
    Row {
        id: rightActions
        objectName: "tabbar-right-actions"
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.xs
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.xs
        readonly property int unread: root.notifications.unread
        Ui.EditorButton {
            id: bell
            objectName: "tabbar-notifications"
            width: Ui.Metrics.compact
            height: Ui.Metrics.compact
            implicitWidth: Ui.Metrics.compact
            implicitHeight: Ui.Metrics.compact
            leftPadding: Ui.Metrics.none
            rightPadding: Ui.Metrics.none
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            iconName: "notifications"
            iconSize: Ui.Metrics.iconSm
            iconTone: hovered ? Ui.Text.Primary : Ui.Text.Secondary
            accessibleName: rightActions.unread === 0 ? qsTr("Notifications, no unread notifications")
                : rightActions.unread === 1 ? qsTr("Notifications, 1 unread notification")
                : qsTr("Notifications, %1 unread notifications").arg(rightActions.unread)
            onHoveredChanged: root.hint(bell, hovered ? qsTr("Notifications") : "", Ui.Metrics.tooltipDelay)
            onPressed: root.unhint()
            onClicked: root.notifications.open(bell.mapToGlobal(bell.width, bell.height))
            // The web CountBadge in its dot form, in the secondary color.
            Rectangle {
                objectName: "tabbar-notifications-unread"
                visible: rightActions.unread > 0
                width: Ui.Metrics.md
                height: Ui.Metrics.md
                radius: Ui.Metrics.radiusPill
                x: parent.width - width - Ui.Metrics.micro
                y: Ui.Metrics.micro
                color: Ui.Theme.accentSecondary
            }
        }
        Ui.EditorButton {
            id: settingsButton
            objectName: "tabbar-settings"
            width: Ui.Metrics.compact
            height: Ui.Metrics.compact
            implicitWidth: Ui.Metrics.compact
            implicitHeight: Ui.Metrics.compact
            leftPadding: Ui.Metrics.none
            rightPadding: Ui.Metrics.none
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            iconName: "settings"
            iconSize: Ui.Metrics.iconSm
            iconTone: hovered ? Ui.Text.Primary : Ui.Text.Secondary
            accessibleName: qsTr("Settings")
            onHoveredChanged: root.hint(settingsButton, hovered ? qsTr("Open settings") : "", Ui.Metrics.tooltipDelay)
            onPressed: root.unhint()
            onClicked: root.tabs.openSettings()
        }
    }
    function openProjects() {
        root.tabs.showProjectMenu(selector.mapToGlobal(0, selector.height));
    }
}

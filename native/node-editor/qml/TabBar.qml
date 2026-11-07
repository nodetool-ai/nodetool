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
    property int dragSource: -1
    property int dropTarget: -1
    property bool dropAfter: false
    property int renaming: -1
    color: roles.chrome
    implicitHeight: roles.tabHeight

    // A drop lands only on a tab, as the web drop handler does.
    function updateDrop(x, y) {
        const item = y >= 0 && y <= tabRow.height ? tabRow.childAt(x, tabRow.height / 2) : null;
        if (!item || item.tabIndex === undefined) {
            dropTarget = -1;
            return;
        }
        dropTarget = item.tabIndex;
        dropAfter = x >= item.x + item.width / 2;
    }
    function finishDrop() {
        const source = dragSource;
        const target = dropTarget;
        const after = dropAfter;
        dragSource = -1;
        dropTarget = -1;
        if (editor && source >= 0 && target >= 0) {
            editor.dropTab(source, target, after);
        }
    }
    function reveal() {
        if (!editor) {
            return;
        }
        const limit = Math.max(0, strip.contentWidth - strip.width);
        strip.contentX = Math.max(0, Math.min(editor.tabStripOffset(), limit));
        const item = tabRepeater.itemAt(editor.activeTab);
        if (!item) {
            return;
        }
        if (item.x < strip.contentX) {
            strip.contentX = item.x;
        } else if (item.x + item.width > strip.contentX + strip.width) {
            strip.contentX = Math.min(limit, item.x + item.width - strip.width);
        }
    }
    // QToolTip leaves the strip's window, which is only as tall as the strip.
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
        if (editor) {
            editor.showTabToolTip("", Qt.point(0, 0));
        }
    }
    Timer {
        id: tooltipTimer
        property Item owner: null
        property string text: ""
        property point at
        onTriggered: {
            if (editor) {
                editor.showTabToolTip(text, at);
            }
        }
    }
    Connections {
        target: editor
        function onTabRenameRequested(index) {
            root.renaming = index;
        }
        function onTabsChanged() {
            Qt.callLater(root.reveal);
        }
    }
    Component.onCompleted: Qt.callLater(root.reveal)
    onWidthChanged: Qt.callLater(root.reveal)

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
                    text: editor ? editor.projectName : ""
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
        Flickable {
            id: strip
            objectName: "workflow-tab-strip"
            height: bar.height
            width: Math.max(0, Math.min(tabRow.implicitWidth, root.width - selector.width - newTabSlot.width - rightActions.width - Ui.Metrics.xl))
            contentWidth: tabRow.implicitWidth
            contentHeight: height
            clip: true
            flickableDirection: Flickable.HorizontalFlick
            boundsBehavior: Flickable.StopAtBounds
            onContentXChanged: {
                if (editor) {
                    editor.setTabStripOffset(contentX);
                }
            }
            Row {
                id: tabRow
                height: strip.height
                Repeater {
                    id: tabRepeater
                    model: editor ? editor.workflowTabs : []
                    delegate: Rectangle {
                        id: tab
                        required property int index
                        required property var modelData
                        readonly property int tabIndex: index
                        readonly property bool active: !!editor && editor.activeTab === index
                        objectName: "workflow-tab-" + index
                        height: tabRow.height
                        width: Math.max(roles.tabMinWidth, Math.min(roles.tabMaxWidth, tabContent.implicitWidth + Ui.Metrics.lg * 2))
                        color: active ? roles.canvas : tabHover.hovered ? Ui.Theme.actionHover : "transparent"
                        activeFocusOnTab: true
                        Accessible.role: Accessible.PageTab
                        Accessible.name: modelData.title + (modelData.running ? ", running" : "") + (modelData.dirty ? ", unsaved changes" : "")
                        Accessible.checkable: true
                        Accessible.checked: active
                        Accessible.onPressAction: editor.activateTab(index)
                        Keys.onReturnPressed: editor.activateTab(index)
                        Keys.onSpacePressed: editor.activateTab(index)
                        HoverHandler {
                            id: tabHover
                        }
                        MouseArea {
                            id: tabArea
                            property point pressPoint
                            property bool dragging: false
                            objectName: "activate-tab-" + tab.index
                            anchors.fill: parent
                            acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton
                            preventStealing: true
                            onPressed: mouse => {
                                pressPoint = Qt.point(mouse.x, mouse.y);
                                dragging = false;
                                root.unhint();
                            }
                            onPositionChanged: mouse => {
                                if (!(pressedButtons & Qt.LeftButton) || root.renaming === tab.index) {
                                    return;
                                }
                                if (!dragging && Math.abs(mouse.x - pressPoint.x) < Qt.styleHints.startDragDistance) {
                                    return;
                                }
                                dragging = true;
                                root.dragSource = tab.index;
                                const position = mapToItem(tabRow, mouse.x, mouse.y);
                                root.updateDrop(position.x, position.y);
                            }
                            onReleased: mouse => {
                                if (mouse.button === Qt.LeftButton && dragging) {
                                    const position = mapToItem(tabRow, mouse.x, mouse.y);
                                    root.updateDrop(position.x, position.y);
                                    root.finishDrop();
                                }
                            }
                            onCanceled: {
                                dragging = false;
                                root.dragSource = -1;
                                root.dropTarget = -1;
                            }
                            onClicked: mouse => {
                                if (mouse.button === Qt.MiddleButton) {
                                    editor.closeTab(tab.index);
                                } else if (mouse.button === Qt.RightButton) {
                                    editor.showTabMenu(tab.index, mapToGlobal(mouse.x, mouse.y));
                                } else if (!dragging) {
                                    tab.forceActiveFocus();
                                    editor.activateTab(tab.index);
                                }
                            }
                            onDoubleClicked: mouse => {
                                if (mouse.button === Qt.LeftButton && tab.modelData.renamable) {
                                    root.renaming = tab.index;
                                }
                            }
                        }
                        RowLayout {
                            id: tabContent
                            anchors.left: parent.left
                            anchors.leftMargin: Ui.Metrics.lg
                            anchors.right: parent.right
                            anchors.rightMargin: Ui.Metrics.lg
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: Ui.Metrics.sm
                            Ui.BusyIndicator {
                                objectName: "running-indicator"
                                visible: tab.modelData.running && root.renaming !== tab.index
                                running: visible
                                implicitWidth: Ui.Metrics.iconXs
                                implicitHeight: Ui.Metrics.iconXs
                                tone: Ui.Text.Info
                                accessibleName: "Running"
                            }
                            Ui.Text {
                                id: title
                                objectName: "tab-title"
                                visible: root.renaming !== tab.index
                                Layout.fillWidth: true
                                text: tab.modelData.title
                                role: Ui.Typography.SansLabel
                                tone: tab.active || tabHover.hovered ? Ui.Text.Primary : Ui.Text.Secondary
                                elide: Text.ElideRight
                                // Only a cut-off name needs its full text.
                                HoverHandler {
                                    onHoveredChanged: root.hint(tab, hovered && title.truncated ? tab.modelData.title : "", roles.tabTitleTooltipDelay)
                                }
                            }
                            Ui.TextField {
                                objectName: "tab-rename"
                                visible: root.renaming === tab.index
                                Layout.fillWidth: true
                                density: Ui.EditorButton.Compact
                                accessibleName: "Tab name"
                                value: tab.modelData.title
                                onVisibleChanged: {
                                    if (visible) {
                                        forceActiveFocus();
                                        selectAll();
                                    }
                                }
                                onValueCommitted: value => {
                                    root.renaming = -1;
                                    editor.renameTab(tab.index, value);
                                }
                                onEditCanceled: root.renaming = -1
                                onAccepted: root.renaming = -1
                                onActiveFocusChanged: {
                                    if (!activeFocus && !editing) {
                                        root.renaming = -1;
                                    }
                                }
                                Keys.onEscapePressed: root.renaming = -1
                            }
                            Rectangle {
                                objectName: "unsaved-indicator"
                                visible: tab.modelData.dirty && root.renaming !== tab.index
                                implicitWidth: Ui.Metrics.md
                                implicitHeight: Ui.Metrics.md
                                radius: Ui.Metrics.radiusPill
                                color: Ui.Theme.statusWarning
                                Accessible.name: "Unsaved changes"
                            }
                            Ui.EditorButton {
                                id: closeButton
                                objectName: "close-tab-" + tab.index
                                density: Ui.EditorButton.Compact
                                variant: Ui.EditorButton.Flat
                                iconName: "close"
                                iconSize: Ui.Metrics.iconXs
                                iconTone: hovered ? Ui.Text.Primary : Ui.Text.Disabled
                                implicitWidth: Ui.Metrics.iconSm
                                implicitHeight: Ui.Metrics.iconSm
                                leftPadding: Ui.Metrics.none
                                rightPadding: Ui.Metrics.none
                                accessibleName: "Close " + tab.modelData.title
                                onHoveredChanged: root.hint(closeButton, hovered ? accessibleName : "", Ui.Metrics.tooltipDelay)
                                onPressed: root.unhint()
                                onClicked: editor.closeTab(tab.index)
                            }
                        }
                        Rectangle {
                            id: dropIndicator
                            objectName: "drop-indicator"
                            visible: root.dragSource >= 0 && root.dropTarget === tab.index
                            x: root.dropAfter ? parent.width - width : 0
                            width: Ui.Metrics.focus
                            height: parent.height
                            color: Ui.Theme.accentPrimary
                        }
                        Rectangle {
                            anchors.bottom: parent.bottom
                            width: parent.width
                            height: Ui.Metrics.focus
                            visible: tab.active && !dropIndicator.visible
                            color: Ui.Theme.accentPrimary
                        }
                        Rectangle {
                            anchors.right: parent.right
                            width: Ui.Metrics.border
                            height: parent.height
                            color: roles.divider
                        }
                    }
                }
            }
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
                onClicked: editor.newTab()
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
        readonly property int unread: editor ? editor.unreadNotifications : 0
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
            onClicked: editor.showNotifications(bell.mapToGlobal(bell.width, bell.height))
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
            onClicked: editor.openSettings()
        }
    }
    function openProjects() {
        if (editor) {
            editor.showProjectMenu(selector.mapToGlobal(0, selector.height));
        }
    }
}

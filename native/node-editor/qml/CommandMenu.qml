pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// The Cmd+K / Ctrl+K command palette, matching web/src/components/menus/CommandPalette.tsx
// and web/src/styles/command_menu.css: full-window modal scrim, focused search input at the
// top, fuzzy-ranked grouped commands with icons, a primary accent bar on the active row,
// keyboard shortcut keycaps, hover-to-select, and keyboard navigation.
Item {
    id: root
    required property var controller
    readonly property string query: controller ? controller.query : ""
    readonly property var rows: controller ? controller.rows : []
    readonly property int selectedIndex: controller ? controller.selectedIndex : -1
    property point lastPointerScenePos: Qt.point(-1, -1)

    function activate() {
        search.forceActiveFocus(Qt.PopupFocusReason)
    }

    function ensureVisible(index) {
        if (index < 0 || index >= list.count) {
            return
        }
        const currentRows = root.rows
        const firstSection = currentRows.length > 0 ? currentRows[0].section : ""
        if (index === 0) {
            list.positionViewAtBeginning()
            return
        }
        // Keep the top section header visible when the active item fits in the initial viewport.
        if (currentRows[index].section === firstSection
            && (index + 1) * Ui.Metrics.comfortable + Ui.Metrics.compact <= list.height) {
            list.positionViewAtBeginning()
            return
        }
        list.positionViewAtIndex(index, ListView.Contain)
        if (index > 0 && index < currentRows.length && currentRows[index].section !== currentRows[index - 1].section) {
            const item = list.itemAtIndex(index)
            if (item && item.y - list.contentY < Ui.Metrics.compact) {
                list.contentY = Math.max(list.originY, item.y - Ui.Metrics.compact)
            }
        }
    }

    function handleKey(event) {
        if (!root.controller || search.inputMethodComposing) {
            return false
        }
        const ctrl = (event.modifiers & Qt.ControlModifier) !== 0
        const meta = (event.modifiers & Qt.MetaModifier) !== 0
        const alt = (event.modifiers & Qt.AltModifier) !== 0
        const shift = (event.modifiers & Qt.ShiftModifier) !== 0

        // Cmd+K (macOS) or Ctrl+K (Windows/Linux) toggles the palette closed.
        if (event.key === Qt.Key_K && ctrl && !alt && !shift) {
            root.controller.close()
            event.accepted = true
            return true
        }
        if (event.key === Qt.Key_Escape) {
            root.controller.close()
            event.accepted = true
            return true
        }
        if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
            root.controller.activateCurrent()
            event.accepted = true
            return true
        }
        // Keep Tab inside the modal palette rather than escaping to the canvas behind it.
        if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
            root.controller.move(event.key === Qt.Key_Backtab || shift ? -1 : 1)
            event.accepted = true
            return true
        }

        // Arrow keys and cmdk vim bindings (Ctrl+N/J down, Ctrl+P/K up).
        const vimModifier = Qt.platform.os === "osx" ? (meta && !ctrl && !alt) : (ctrl && !meta && !alt)
        const moveDown = event.key === Qt.Key_Down || (vimModifier && (event.key === Qt.Key_N || event.key === Qt.Key_J))
        const moveUp = event.key === Qt.Key_Up || (vimModifier && (event.key === Qt.Key_P || event.key === Qt.Key_K))
        if (moveDown) {
            if (ctrl && event.key === Qt.Key_Down) {
                root.controller.selectLast()
            } else if (alt && event.key === Qt.Key_Down) {
                root.controller.moveGroup(1)
            } else {
                root.controller.move(1)
            }
            event.accepted = true
            return true
        }
        if (moveUp) {
            if (ctrl && event.key === Qt.Key_Up) {
                root.controller.selectFirst()
            } else if (alt && event.key === Qt.Key_Up) {
                root.controller.moveGroup(-1)
            } else {
                root.controller.move(-1)
            }
            event.accepted = true
            return true
        }
        if (event.key === Qt.Key_PageDown) {
            root.controller.movePage(1)
            event.accepted = true
            return true
        }
        if (event.key === Qt.Key_PageUp) {
            root.controller.movePage(-1)
            event.accepted = true
            return true
        }
        if (event.key === Qt.Key_Home && search.text.length === 0) {
            root.controller.selectFirst()
            event.accepted = true
            return true
        }
        if (event.key === Qt.Key_End && search.text.length === 0) {
            root.controller.selectLast()
            event.accepted = true
            return true
        }
        return false
    }

    Connections {
        target: root.controller
        function onSelectionChanged() {
            root.ensureVisible(root.controller.selectedIndex)
        }
        function onRowsChanged() {
            list.positionViewAtBeginning()
        }
    }

    // Fallback when focus lands anywhere in the overlay outside the search field:
    // keep navigation working and route printable keys or Backspace straight into search.
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: event => {
        if (root.handleKey(event)) {
            return
        }
        if (!search.activeFocus && (event.modifiers & (Qt.ControlModifier | Qt.MetaModifier | Qt.AltModifier)) === 0) {
            if (event.key === Qt.Key_Backspace) {
                search.forceActiveFocus(Qt.PopupFocusReason)
                if (search.text.length > 0) {
                    search.text = search.text.slice(0, -1)
                    search.cursorPosition = search.text.length
                }
                event.accepted = true
            } else if (event.text.length > 0 && event.text.charCodeAt(0) >= 32) {
                search.forceActiveFocus(Qt.PopupFocusReason)
                search.insert(search.cursorPosition, event.text)
                event.accepted = true
            }
        }
    }

    // Modal scrim covering the window; pressing outside the card closes the menu.
    Rectangle {
        id: scrim
        objectName: "command-scrim"
        anchors.fill: parent
        color: Ui.Theme.scrimModal
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.AllButtons
            onPressed: mouse => {
                mouse.accepted = true
                if (root.controller) {
                    root.controller.close()
                }
            }
            onWheel: wheel => { wheel.accepted = true }
        }
    }

    Item {
        id: cardFrame
        objectName: "command-card"
        readonly property real maxCardWidth: Ui.Metrics.dialogWidth + Ui.Metrics.xxxl
        readonly property real minCardWidth: Ui.Metrics.dialogWidth - Ui.Metrics.xxxl * 2
        readonly property real availableWidth: Math.max(0, root.width - Ui.Metrics.xxxl)
        readonly property real availableHeight: Math.max(0, root.height - Ui.Metrics.xxxl * 2)
        width: Math.min(availableWidth, Math.min(maxCardWidth, Math.max(minCardWidth, Math.round(root.width * 0.44))))
        height: Math.min(availableHeight, Math.round(Ui.Metrics.xxxl * 16))
        x: Math.round((root.width - width) / 2)
        y: Math.max(Ui.Metrics.xxl, Math.round((root.height - height) * 0.28))

        // Subtle elevation shadow behind the floating palette card.
        Rectangle {
            anchors.fill: parent
            anchors.leftMargin: -Ui.Metrics.xs
            anchors.rightMargin: -Ui.Metrics.xs
            anchors.topMargin: Ui.Metrics.xs
            anchors.bottomMargin: -Ui.Metrics.md
            radius: Ui.Metrics.radiusOverlay + Ui.Metrics.xs
            color: Ui.Theme.graphShadow
        }

        Rectangle {
            id: card
            anchors.fill: parent
            color: Ui.Theme.surfacePanel
            radius: Ui.Metrics.radiusOverlay
            border.width: Ui.Metrics.border
            border.color: Ui.Theme.borderControl
            clip: true

            // Keep clicks and wheel events inside the card from reaching the scrim,
            // and return keyboard focus to the search input on dead-space clicks.
            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.AllButtons
                onPressed: mouse => {
                    mouse.accepted = true
                    search.forceActiveFocus(Qt.PopupFocusReason)
                }
                onWheel: wheel => { wheel.accepted = true }
            }

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: Ui.Metrics.border
                spacing: Ui.Metrics.none

                Item {
                    Layout.fillWidth: true
                    Layout.preferredHeight: search.implicitHeight + Ui.Metrics.lg * 2
                    Ui.TextField {
                        id: search
                        objectName: "action-search"
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.verticalCenter: parent.verticalCenter
                        anchors.leftMargin: Ui.Metrics.lg
                        anchors.rightMargin: Ui.Metrics.lg
                        role: Ui.Typography.SansBody
                        density: Ui.EditorButton.Comfortable
                        leadingIcon: "search"
                        clearable: true
                        handleEscape: false
                        handleReturn: false
                        placeholderText: qsTr("Type a command or search")
                        accessibleName: qsTr("Search commands")
                        value: root.query
                        onValuePreviewed: value => {
                            if (root.controller) {
                                root.controller.setQuery(value)
                            }
                        }
                        onValueCommitted: value => {
                            if (root.controller) {
                                root.controller.setQuery(value)
                            }
                        }
                        onTextChanged: {
                            if (root.controller && text !== root.controller.query) {
                                root.controller.setQuery(text)
                            }
                        }
                        Keys.priority: Keys.BeforeItem
                        Keys.onPressed: event => root.handleKey(event)
                        Component.onCompleted: forceActiveFocus(Qt.PopupFocusReason)
                    }
                }

                Ui.Separator {
                    Layout.fillWidth: true
                }

                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true

                    ListView {
                        id: list
                        objectName: "action-list"
                        anchors.fill: parent
                        anchors.topMargin: Ui.Metrics.xs
                        anchors.bottomMargin: Ui.Metrics.xs
                        clip: true
                        boundsBehavior: Flickable.StopAtBounds
                        highlightFollowsCurrentItem: false
                        cacheBuffer: 180
                        model: root.rows
                        currentIndex: root.selectedIndex
                        section.property: "section"
                        section.delegate: Item {
                            id: sectionHeader
                            required property string section
                            width: list.width
                            height: Ui.Metrics.compact
                            Ui.Text {
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.leftMargin: Ui.Metrics.xl
                                anchors.rightMargin: Ui.Metrics.xl
                                anchors.bottom: parent.bottom
                                anchors.bottomMargin: Ui.Metrics.xs
                                text: sectionHeader.section.toUpperCase()
                                role: Ui.Typography.SansCaption
                                weight: Font.DemiBold
                                tone: Ui.Text.Secondary
                                tight: true
                                elide: Text.ElideRight
                            }
                        }
                        Basic.ScrollBar.vertical: Ui.ScrollBar {}
                        delegate: Ui.ListRow {
                            id: row
                            flat: true
                            required property var modelData
                            required property int index
                            objectName: "command-row-" + index
                            x: Ui.Metrics.md
                            width: ListView.view.width - Ui.Metrics.xl
                            height: Ui.Metrics.comfortable
                            implicitHeight: Ui.Metrics.comfortable
                            accessibleName: modelData.label
                            enabled: modelData.available
                            active: index === root.selectedIndex
                            onClicked: {
                                if (root.controller) {
                                    root.controller.activate(index)
                                }
                            }

                            // Active left accent bar matching web [cmdk-item][data-selected="true"]:after.
                            Rectangle {
                                visible: row.active && row.enabled
                                anchors.left: parent.left
                                anchors.verticalCenter: parent.verticalCenter
                                width: Ui.Metrics.micro + Ui.Metrics.border
                                height: Ui.Metrics.iconLg
                                radius: Ui.Metrics.micro
                                color: Ui.Theme.accentPrimary
                            }

                            Ui.Icon {
                                id: rowIcon
                                anchors.left: parent.left
                                anchors.leftMargin: Ui.Metrics.lg
                                anchors.verticalCenter: parent.verticalCenter
                                name: row.modelData.icon
                                size: Ui.Metrics.iconSm
                                tone: !row.enabled ? Ui.Text.Disabled : row.active ? Ui.Text.Primary : Ui.Text.Secondary
                            }

                            Ui.Text {
                                anchors.left: rowIcon.right
                                anchors.leftMargin: Ui.Metrics.md
                                anchors.right: keycaps.visible ? keycaps.left : parent.right
                                anchors.rightMargin: Ui.Metrics.md
                                anchors.verticalCenter: parent.verticalCenter
                                text: row.modelData.label
                                role: Ui.Typography.SansLabel
                                weight: row.active ? Font.Medium : Font.Normal
                                tone: row.enabled ? Ui.Text.Primary : Ui.Text.Disabled
                                elide: Text.ElideRight
                                tight: true
                            }

                            Row {
                                id: keycaps
                                visible: row.modelData.shortcuts.length > 0
                                anchors.right: parent.right
                                anchors.rightMargin: Ui.Metrics.md
                                anchors.verticalCenter: parent.verticalCenter
                                spacing: Ui.Metrics.xs
                                Repeater {
                                    model: row.modelData.shortcuts
                                    delegate: Rectangle {
                                        required property string modelData
                                        width: hintText.implicitWidth + Ui.Metrics.md
                                        height: Ui.Metrics.iconLg
                                        radius: Ui.Metrics.xs
                                        color: row.active ? Ui.Theme.surfaceOverlay : Ui.Theme.surfaceInput
                                        border.width: Ui.Metrics.border
                                        border.color: Ui.Theme.borderSubtle
                                        Ui.ShortcutHint {
                                            id: hintText
                                            anchors.centerIn: parent
                                            text: parent.modelData
                                            tone: row.enabled ? Ui.Text.Secondary : Ui.Text.Disabled
                                            tight: true
                                        }
                                    }
                                }
                            }

                            HoverHandler {
                                id: rowHover
                                onPointChanged: {
                                    if (!rowHover.hovered || !row.enabled || !root.controller) {
                                        return
                                    }
                                    const scenePos = row.mapToItem(root, rowHover.point.position.x, rowHover.point.position.y)
                                    if (Math.abs(scenePos.x - root.lastPointerScenePos.x) < 1
                                        && Math.abs(scenePos.y - root.lastPointerScenePos.y) < 1) {
                                        return
                                    }
                                    root.lastPointerScenePos = scenePos
                                    if (root.controller.selectedIndex !== row.index) {
                                        root.controller.selectIndex(row.index)
                                    }
                                }
                            }
                        }
                    }

                    Column {
                        objectName: "command-empty"
                        anchors.centerIn: parent
                        visible: list.count === 0
                        spacing: Ui.Metrics.sm
                        Ui.Icon {
                            anchors.horizontalCenter: parent.horizontalCenter
                            name: "search"
                            size: Ui.Metrics.iconLg
                            tone: Ui.Text.Disabled
                        }
                        Ui.Text {
                            anchors.horizontalCenter: parent.horizontalCenter
                            text: qsTr("No results found.")
                            role: Ui.Typography.SansLabel
                            tone: Ui.Text.Secondary
                            tight: true
                        }
                    }
                }

                Ui.Separator {
                    Layout.fillWidth: true
                }

                Item {
                    Layout.fillWidth: true
                    Layout.preferredHeight: Ui.Metrics.standard
                    Row {
                        anchors.left: parent.left
                        anchors.leftMargin: Ui.Metrics.lg
                        anchors.verticalCenter: parent.verticalCenter
                        spacing: Ui.Metrics.lg
                        Row {
                            spacing: Ui.Metrics.sm
                            Rectangle {
                                width: navKey.implicitWidth + Ui.Metrics.md
                                height: Ui.Metrics.iconMd
                                radius: Ui.Metrics.xs
                                color: Ui.Theme.surfaceInput
                                border.width: Ui.Metrics.border
                                border.color: Ui.Theme.borderSubtle
                                anchors.verticalCenter: parent.verticalCenter
                                Ui.ShortcutHint { id: navKey; text: "↑↓"; anchors.centerIn: parent; tight: true }
                            }
                            Ui.Text { text: qsTr("Navigate"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; anchors.verticalCenter: parent.verticalCenter; tight: true }
                        }
                        Row {
                            spacing: Ui.Metrics.sm
                            Rectangle {
                                width: runKey.implicitWidth + Ui.Metrics.md
                                height: Ui.Metrics.iconMd
                                radius: Ui.Metrics.xs
                                color: Ui.Theme.surfaceInput
                                border.width: Ui.Metrics.border
                                border.color: Ui.Theme.borderSubtle
                                anchors.verticalCenter: parent.verticalCenter
                                Ui.ShortcutHint { id: runKey; text: "↵"; anchors.centerIn: parent; tight: true }
                            }
                            Ui.Text { text: qsTr("Run"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; anchors.verticalCenter: parent.verticalCenter; tight: true }
                        }
                        Row {
                            spacing: Ui.Metrics.sm
                            Rectangle {
                                width: escKey.implicitWidth + Ui.Metrics.md
                                height: Ui.Metrics.iconMd
                                radius: Ui.Metrics.xs
                                color: Ui.Theme.surfaceInput
                                border.width: Ui.Metrics.border
                                border.color: Ui.Theme.borderSubtle
                                anchors.verticalCenter: parent.verticalCenter
                                Ui.ShortcutHint { id: escKey; text: "Esc"; anchors.centerIn: parent; tight: true }
                            }
                            Ui.Text { text: qsTr("Close"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; anchors.verticalCenter: parent.verticalCenter; tight: true }
                        }
                    }
                    Ui.Text {
                        objectName: "command-count"
                        anchors.right: parent.right
                        anchors.rightMargin: Ui.Metrics.lg
                        anchors.verticalCenter: parent.verticalCenter
                        text: root.query.trim().length > 0
                            ? qsTr("%1 %2").arg(list.count).arg(list.count === 1 ? qsTr("match") : qsTr("matches"))
                            : qsTr("%1 commands").arg(list.count)
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        tight: true
                    }
                }
            }
        }
    }
}

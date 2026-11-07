import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The workflow document bar under the tab bar: the name, the save state,
// Undo and Redo, the Graph and Chain switch, the chat, mini-map and inspector
// toggles, and the More menu. See web/src/components/workspace/WorkflowDocumentBar.tsx
// and web/src/components/ui_primitives/DocumentBar.tsx.
Rectangle {
    id: root
    property bool renaming: false
    readonly property string saveStatus: editor ? editor.documentSaveStatus : "saved"
    // web/src/i18n/locales/en.json: saveState and saveStatus.
    readonly property string saveLabel: {
        if (saveStatus === "saving") {
            return "Saving…"
        }
        if (saveStatus === "dirty") {
            return "Unsaved changes"
        }
        if (saveStatus === "error") {
            return "Not saved"
        }
        if (saveStatus === "conflict") {
            return "Server conflict"
        }
        if (saveStatus === "deleted") {
            return "Server deleted"
        }
        if (saveStatus === "readOnly") {
            return "Read only"
        }
        return "Saved"
    }
    readonly property string saveActionLabel: {
        if (saveStatus === "error") {
            return "Retry"
        }
        if (saveStatus === "conflict" || saveStatus === "deleted") {
            return "Review"
        }
        return ""
    }
    // The native editor has no chain view yet. See the gap rows in docs/parity.md.
    readonly property string chainUnavailableReason: "The chain view is not available in the native editor yet."
    implicitHeight: roles.headerHeight
    color: Ui.Theme.surfacePanel
    EditorRoles {
        id: roles
    }

    function showHint(text) {
        if (editor) {
            editor.showToolTip(text)
        }
    }

    component HeaderButton: PanelRow {
        id: button
        property string iconName: ""
        property string tooltip: text
        implicitWidth: Ui.Metrics.compact
        implicitHeight: Ui.Metrics.compact
        accessibleName: tooltip
        HoverHandler {
            onHoveredChanged: root.showHint(hovered ? button.tooltip : "")
        }
        Ui.Icon {
            anchors.centerIn: parent
            name: button.iconName
            size: Ui.Metrics.iconSm
            tone: button.enabled ? Ui.Text.Secondary : Ui.Text.Disabled
            domainColor: button.active ? Ui.Theme.accentPrimary : undefined
        }
    }

    component ModeOption: Item {
        id: option
        property string text: ""
        property string iconName: ""
        property bool selected: false
        property bool available: true
        property string tooltip: ""
        signal picked()
        implicitWidth: optionRow.implicitWidth + Ui.Metrics.sm * 2
        implicitHeight: Ui.Metrics.compact
        Accessible.role: Accessible.RadioButton
        Accessible.name: text
        Accessible.checked: selected
        Accessible.description: tooltip
        // A disabled control receives no hover, so the reason hangs on this wrapper.
        HoverHandler {
            onHoveredChanged: root.showHint(hovered ? option.tooltip : "")
        }
        PanelRow {
            id: optionButton
            objectName: option.objectName + "-button"
            anchors.fill: parent
            text: option.text
            enabled: option.available
            active: option.selected
            onClicked: option.picked()
        }
        Row {
            id: optionRow
            anchors.centerIn: parent
            spacing: Ui.Metrics.xs
            Ui.Icon {
                anchors.verticalCenter: parent.verticalCenter
                name: option.iconName
                size: Ui.Metrics.iconSm
                tone: !option.available ? Ui.Text.Disabled : option.selected ? Ui.Text.Primary : Ui.Text.Secondary
            }
            Ui.Text {
                anchors.verticalCenter: parent.verticalCenter
                text: option.text
                role: Ui.Typography.SansLabel
                font.weight: Font.Normal
                lineHeight: 1
                tone: !option.available ? Ui.Text.Disabled : option.selected ? Ui.Text.Primary : Ui.Text.Secondary
            }
        }
    }

    component SlotDivider: Rectangle {
        implicitWidth: Ui.Metrics.border
        implicitHeight: Ui.Metrics.iconSm
        color: roles.divider
    }

    Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: Ui.Metrics.border
        color: roles.divider
    }

    RowLayout {
        id: bar
        objectName: "header-row"
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: Ui.Metrics.md
        anchors.rightMargin: Ui.Metrics.md
        anchors.verticalCenter: parent.verticalCenter
        anchors.verticalCenterOffset: -Ui.Metrics.border / 2
        spacing: Ui.Metrics.md

        Ui.Text {
            id: title
            objectName: "header-title"
            visible: !root.renaming
            // The whole name when it fits. A narrow bar elides it.
            Layout.fillWidth: true
            Layout.preferredWidth: Math.ceil(implicitWidth)
            Layout.maximumWidth: Math.ceil(implicitWidth)
            text: editor ? editor.workflowName : ""
            role: Ui.Typography.SansBody
            font.weight: Font.Medium
            lineHeight: 1
            elide: Text.ElideRight
            Accessible.role: Accessible.StaticText
            Accessible.name: text
            Accessible.description: editor && editor.workflowRenamable ? "Double-click to rename" : ""
            HoverHandler {
                onHoveredChanged: root.showHint(hovered && editor && editor.workflowRenamable ? "Double-click to rename" : "")
            }
            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.LeftButton
                onDoubleClicked: {
                    if (editor && editor.workflowRenamable) {
                        root.showHint("")
                        root.renaming = true
                    }
                }
            }
        }
        Ui.TextField {
            id: renameField
            objectName: "header-rename"
            visible: root.renaming
            Layout.preferredWidth: Math.max(title.implicitWidth, Ui.Metrics.dialogCompactWidth / 2)
            density: Ui.EditorButton.Compact
            accessibleName: "Document name"
            value: editor ? editor.workflowName : ""
            onVisibleChanged: {
                if (visible) {
                    forceActiveFocus()
                    selectAll()
                }
            }
            onValueCommitted: value => {
                root.renaming = false
                editor.renameWorkflow(value)
            }
            onEditCanceled: root.renaming = false
            onAccepted: root.renaming = false
            onActiveFocusChanged: {
                if (!activeFocus && !editing) {
                    root.renaming = false
                }
            }
            Keys.onEscapePressed: root.renaming = false
        }

        Row {
            id: saveState
            objectName: "header-save-state"
            readonly property string state: root.saveStatus
            spacing: Ui.Metrics.xs
            Accessible.role: Accessible.StaticText
            Accessible.name: root.saveLabel
            Rectangle {
                objectName: "header-save-dot"
                anchors.verticalCenter: parent.verticalCenter
                visible: root.saveStatus !== "saving" && root.saveStatus !== "readOnly"
                width: Ui.Metrics.md
                height: Ui.Metrics.md
                radius: Ui.Metrics.radiusPill
                color: root.saveStatus === "saved" ? Ui.Theme.statusSuccess : root.saveStatus === "dirty" ? Ui.Theme.statusWarning : Ui.Theme.statusError
            }
            Ui.BusyIndicator {
                anchors.verticalCenter: parent.verticalCenter
                visible: root.saveStatus === "saving"
                running: visible
                width: Ui.Metrics.iconXs
                height: Ui.Metrics.iconXs
                accessibleName: root.saveLabel
            }
            Ui.Text {
                objectName: "header-save-label"
                anchors.verticalCenter: parent.verticalCenter
                text: root.saveLabel
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                lineHeight: 1
            }
        }
        Ui.EditorButton {
            objectName: "header-save-action"
            visible: root.saveActionLabel !== ""
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            text: root.saveActionLabel
            onClicked: editor.action(root.saveStatus === "error" ? "Server Save" : "Server sync")
        }

        SlotDivider {
        }
        Row {
            spacing: Ui.Metrics.xs
            HeaderButton {
                objectName: "header-undo"
                text: "Undo"
                iconName: "undo"
                enabled: editor && editor.canUndo
                onClicked: editor.action("Undo")
            }
            HeaderButton {
                objectName: "header-redo"
                text: "Redo"
                iconName: "redo"
                enabled: editor && editor.canRedo
                onClicked: editor.action("Redo")
            }
        }

        SlotDivider {
        }
        Rectangle {
            id: modeSwitch
            objectName: "header-mode"
            implicitWidth: modeRow.implicitWidth + Ui.Metrics.border * 2
            implicitHeight: Ui.Metrics.compact
            radius: Ui.Metrics.radiusControl
            color: Ui.Theme.actionHover
            border.width: Ui.Metrics.border
            border.color: roles.divider
            clip: true
            Accessible.role: Accessible.Grouping
            Accessible.name: "Editor view"
            Row {
                id: modeRow
                anchors.centerIn: parent
                ModeOption {
                    objectName: "header-mode-graph"
                    text: "Graph"
                    iconName: "accountTree"
                    selected: true
                }
                ModeOption {
                    objectName: "header-mode-chain"
                    text: "Chain"
                    iconName: "linearScale"
                    available: false
                    tooltip: root.chainUnavailableReason
                }
            }
        }

        SlotDivider {
        }
        Row {
            spacing: Ui.Metrics.xs
            HeaderButton {
                objectName: "header-chat"
                text: "Toggle conversation"
                iconName: "forumOutlined"
                active: editor && editor.chatVisible
                tooltip: active ? "Close chat" : "Open chat"
                onClicked: editor.toggleChat()
            }
            HeaderButton {
                objectName: "header-mini-map"
                text: "Mini map"
                iconName: "map"
                active: editor && editor.miniMapVisible
                onClicked: editor.setMiniMapVisible(!editor.miniMapVisible)
            }
            HeaderButton {
                objectName: "header-inspector"
                text: "Toggle inspector"
                iconName: "tune"
                active: editor && editor.inspectorVisible
                tooltip: active ? "Hide inspector" : "Show inspector"
                onClicked: editor.action("Toggle inspector")
            }
        }

        Item {
            Layout.fillWidth: true
        }
        HeaderButton {
            objectName: "header-more"
            text: "More actions"
            iconName: "moreVert"
            onClicked: editor.action("More")
        }
    }
}

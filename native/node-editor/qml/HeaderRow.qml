import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The workflow document bar under the tab bar: the name, the save state,
// Undo and Redo, the Graph and Chain switch, the chat, mini-map and inspector
// toggles, and the More menu. See web/src/components/workspace/WorkflowDocumentBar.tsx
// and web/src/components/ui_primitives/DocumentBar.tsx.
Rectangle {
    id: root
    required property WorkflowHeader header
    required property PanelLayout panels
    property bool renaming: false
    readonly property string saveStatus: root.header.saveStatus
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

    component HeaderButton: Ui.ToolbarIconButton {
        property string tooltip: text
        accessibleName: tooltip
        implicitWidth: Ui.Metrics.compact
        implicitHeight: Ui.Metrics.compact
        iconTone: Ui.Text.Secondary
        iconColor: active ? Ui.Theme.accentPrimary : undefined
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
            text: root.header.workflowName
            role: Ui.Typography.SansBody
            font.weight: Font.Medium
            lineHeight: 1
            elide: Text.ElideRight
            Accessible.role: Accessible.StaticText
            Accessible.name: text
            Accessible.description: root.header.renamable ? "Double-click to rename" : ""
            HoverHandler {
                id: titleHover
            }
            Ui.Tooltip {
                trigger: title
                visible: titleHover.hovered && root.header.renamable
                text: "Double-click to rename"
            }
            MouseArea {
                anchors.fill: parent
                acceptedButtons: Qt.LeftButton
                onDoubleClicked: {
                    if (root.header.renamable) {
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
            value: root.header.workflowName
            onVisibleChanged: {
                if (visible) {
                    forceActiveFocus()
                    selectAll()
                }
            }
            onValueCommitted: value => {
                root.renaming = false
                root.header.rename(value)
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
            onClicked: {
                if (root.saveStatus === "error") {
                    root.header.saveToServer()
                } else {
                    root.header.openServerSync()
                }
            }
        }

        SlotDivider {
        }
        Row {
            spacing: Ui.Metrics.xs
            HeaderButton {
                objectName: "header-undo"
                text: "Undo"
                iconName: "undo"
                enabled: root.header.canUndo
                onClicked: root.header.undo()
            }
            HeaderButton {
                objectName: "header-redo"
                text: "Redo"
                iconName: "redo"
                enabled: root.header.canRedo
                onClicked: root.header.redo()
            }
        }

        SlotDivider {
        }
        Ui.SegmentedControl {
            id: modeSwitch
            objectName: "header-mode"
            variant: Ui.SegmentedControl.Tray
            trayBorderColor: roles.divider
            accessibleName: "Editor view"
            value: "graph"
            options: [
                { objectName: "header-mode-graph", value: "graph", label: "Graph", iconName: "accountTree" },
                { objectName: "header-mode-chain", value: "chain", label: "Chain", iconName: "linearScale", enabled: false, reason: root.chainUnavailableReason }
            ]
        }

        SlotDivider {
        }
        Row {
            spacing: Ui.Metrics.xs
            HeaderButton {
                objectName: "header-chat"
                text: "Toggle conversation"
                iconName: "forumOutlined"
                active: root.panels.chatVisible
                tooltip: active ? "Close chat" : "Open chat"
                onClicked: root.panels.toggleChat()
            }
            HeaderButton {
                objectName: "header-mini-map"
                text: "Mini map"
                iconName: "map"
                active: root.panels.miniMapVisible
                onClicked: root.panels.setMiniMapVisible(!root.panels.miniMapVisible)
            }
            HeaderButton {
                objectName: "header-inspector"
                text: "Toggle inspector"
                iconName: "tune"
                active: root.panels.inspectorVisible
                tooltip: active ? "Hide inspector" : "Show inspector"
                onClicked: root.panels.toggleInspector()
            }
        }

        Item {
            Layout.fillWidth: true
        }
        HeaderButton {
            objectName: "header-more"
            text: "More actions"
            iconName: "moreVert"
            onClicked: root.header.openMore()
        }
    }
}

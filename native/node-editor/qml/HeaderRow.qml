import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The workflow document bar under the tab bar: the save state,
// Undo and Redo, the chat, mini-map and inspector
// toggles, and the document commands as icon buttons. See web/src/components/workspace/WorkflowDocumentBar.tsx
// and web/src/components/ui_primitives/DocumentBar.tsx.
Rectangle {
    id: root
    required property WorkflowHeader header
    required property PanelLayout panels
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
                tight: true
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
        Row {
            objectName: "header-actions"
            spacing: Ui.Metrics.xs
            HeaderButton {
                objectName: "header-instant-update"
                text: "Instant update"
                iconName: "autoFixHigh"
                active: root.header.instantUpdate
                enabled: root.header.enabledActions.indexOf("Instant Update: On") >= 0
                tooltip: active ? "Instant update is on" : "Instant update is off"
                onClicked: root.header.runAction(active ? "Instant Update: On" : "Instant Update: Off")
            }
            HeaderButton {
                objectName: "header-navigation"
                visible: root.header.navigationSwitch
                text: "Canvas navigation"
                iconName: root.header.mouseNavigation ? "toolSelect" : "toolHand"
                enabled: root.header.enabledActions.indexOf("Canvas navigation: Mouse") >= 0
                tooltip: root.header.mouseNavigation ? "Canvas navigation: Mouse" : "Canvas navigation: Trackpad"
                onClicked: root.header.runAction(tooltip)
            }
            Repeater {
                model: [
                    { name: "Save", icon: "saveOutlined", id: "save" },
                    { name: "Version history", icon: "history", id: "versions" },
                    { name: "Workflow metadata", icon: "info", id: "metadata" },
                    { name: "Server sync", icon: "sync", id: "server-sync" },
                    { name: "Canvas uploads", icon: "fileUpload", id: "uploads" },
                    { name: "Command menu", icon: "search", id: "command-menu" }
                ]
                HeaderButton {
                    required property var modelData
                    objectName: "header-" + modelData.id
                    text: modelData.name
                    iconName: modelData.icon
                    enabled: root.header.enabledActions.indexOf(modelData.name) >= 0
                    onClicked: root.header.runAction(modelData.name)
                }
            }
        }
    }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
Rectangle {
    id: root
    required property var controller
    required property string kind
    readonly property bool sharing: root.kind === "sharing"
    readonly property bool metadata: root.kind === "metadata"
    // Role labels from ShareDocumentDialog.tsx (pass3_37.shareWorkflow.roleViewer, roleEditor, rolePublic).
    readonly property var roleLabels: ({viewer: "Can view", editor: "Can edit", "public": "Public view"})
    readonly property int linkCount: root.controller.rows.filter(row => row.kind === "link").length
    readonly property int collaboratorCount: root.controller.rows.filter(row => row.kind === "collaborator").length
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
    Basic.ScrollView {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.xl
        contentWidth: availableWidth
        clip: true
        ColumnLayout {
            width: parent.width
            spacing: Ui.Metrics.md
            Ui.Text {
                objectName: "details-title"
                text: root.sharing ? "Share \"" + (root.controller.metadata.name || "") + "\"" : root.kind === "versions" ? "Version history" : "Workflow metadata"
                role: Ui.Typography.SansTitle
                Layout.fillWidth: true
                wrapMode: Text.Wrap
            }
            Ui.Text {
                visible: !root.controller.available
                text: "Save this local workflow to a server first."
                role: Ui.Typography.SansBody
                Layout.fillWidth: true
                wrapMode: Text.Wrap
            }
            Ui.Text {
                objectName: "versions-error"
                text: root.controller.error
                visible: text !== ""
                role: Ui.Typography.SansBody
                Layout.fillWidth: true
                wrapMode: Text.WrapAnywhere
            }
            Ui.EditorButton {
                visible: !root.sharing
                text: "Refresh"
                enabled: root.controller.available && !root.controller.busy
                onClicked: root.controller.load(root.kind)
            }
            // The share dialog below shows what ShareDocumentDialog.tsx shows: the description, the
            // three link buttons, the active links, and the people with access.
            Ui.Text {
                objectName: "share-description"
                visible: root.sharing
                text: "Anyone signed in to this server who opens a view or edit link gets the role assigned to that link. Revoking a link stops new people from joining. People who already joined remain listed below. A public link lets anyone view the workflow and its settings, without an account, and copy it into their own workflows. Revoking the public link stops both viewing and copying."
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                Layout.fillWidth: true
                wrapMode: Text.Wrap
            }
            RowLayout {
                visible: root.sharing
                spacing: Ui.Metrics.sm
                Repeater {
                    model: root.sharing ? ["viewer", "editor", "public"] : []
                    Ui.EditorButton {
                        required property string modelData
                        objectName: "create-share-" + modelData
                        text: "Copy " + (modelData === "viewer" ? "view" : modelData === "editor" ? "edit" : "public") + " link"
                        Layout.minimumWidth: implicitWidth
                        enabled: root.controller.available && !root.controller.busy
                        onClicked: root.controller.createLink(modelData)
                    }
                }
            }
            Ui.Text {
                objectName: "share-loading"
                visible: root.controller.busy
                text: root.sharing ? "Loading collaborators" : "Loading…"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Ui.Text {
                objectName: "share-active-links-title"
                visible: root.sharing && root.linkCount > 0
                text: "Active links"
                role: Ui.Typography.SansLabel
            }
            Repeater {
                model: root.sharing ? root.controller.rows : []
                RowLayout {
                    id: linkRow
                    required property var modelData
                    required property int index
                    visible: linkRow.modelData.kind === "link"
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.sm
                    Rectangle {
                        objectName: "share-role-" + linkRow.index
                        implicitWidth: roleText.implicitWidth + Ui.Metrics.lg
                        implicitHeight: roleText.implicitHeight + Ui.Metrics.xs
                        radius: Ui.Metrics.radiusPill
                        color: "transparent"
                        border.color: Ui.Theme.borderControl
                        border.width: Ui.Metrics.border
                        Ui.Text {
                            id: roleText
                            anchors.centerIn: parent
                            text: root.roleLabels[linkRow.modelData.role] || linkRow.modelData.role || ""
                            role: Ui.Typography.SansCaption
                        }
                    }
                    Ui.EditorButton {
                        objectName: "copy-share-link-" + linkRow.index
                        density: Ui.EditorButton.Compact
                        Layout.minimumWidth: implicitWidth
                        text: root.controller.copied === linkRow.modelData.url ? "Copied" : "Copy share link"
                        onClicked: root.controller.copyText(linkRow.modelData.url)
                    }
                    Item {
                        Layout.fillWidth: true
                    }
                    Ui.EditorButton {
                        objectName: "revoke-share-link-" + linkRow.index
                        density: Ui.EditorButton.Compact
                        Layout.minimumWidth: implicitWidth
                        text: "Revoke"
                        enabled: !root.controller.busy
                        onClicked: root.controller.sharingAction("revokeLink", {share_id: linkRow.modelData.id})
                    }
                }
            }
            Ui.Separator {
                visible: root.sharing
                Layout.fillWidth: true
            }
            Ui.Text {
                visible: root.sharing
                text: "People with access"
                role: Ui.Typography.SansLabel
            }
            ColumnLayout {
                objectName: "share-no-collaborators"
                visible: root.sharing && root.collaboratorCount === 0 && !root.controller.busy
                Layout.fillWidth: true
                Ui.Text {
                    text: "No collaborators yet"
                    role: Ui.Typography.SansLabel
                }
                Ui.Text {
                    text: "Copy a link above and send it to someone."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
            }
            Repeater {
                model: root.sharing ? root.controller.rows : []
                RowLayout {
                    id: personRow
                    required property var modelData
                    required property int index
                    visible: personRow.modelData.kind === "collaborator"
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.sm
                    Ui.Text {
                        text: personRow.modelData.user_id || ""
                        role: Ui.Typography.SansBody
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }
                    Ui.Select {
                        objectName: "share-person-role-" + personRow.index
                        density: Ui.EditorButton.Compact
                        accessibleName: "Role for " + (personRow.modelData.user_id || "")
                        options: [{value: "viewer", label: "Can view"}, {value: "editor", label: "Can edit"}]
                        value: personRow.modelData.role || "viewer"
                        enabled: !root.controller.busy
                        onValueCommitted: role => root.controller.sharingAction("setRole", {user_id: personRow.modelData.user_id, role: role})
                    }
                    Ui.EditorButton {
                        objectName: "remove-share-person-" + personRow.index
                        density: Ui.EditorButton.Compact
                        Layout.minimumWidth: implicitWidth
                        text: "Remove access"
                        enabled: !root.controller.busy
                        onClicked: root.controller.sharingAction("removeCollaborator", {user_id: personRow.modelData.user_id})
                    }
                }
            }
            Ui.Text {
                visible: root.metadata
                text: "Tags"
                role: Ui.Typography.SansLabel
            }
            Ui.TextField {
                visible: root.metadata
                Layout.fillWidth: true
                placeholderText: "Separate tags with commas"
                accessibleName: "Tags separated by commas"
                value: (root.controller.metadata.tags || []).join(", ")
                enabled: root.controller.available
                onValueCommitted: value => root.controller.saveMetadata({tags: [...new Set(value.split(",").map(tag => tag.trim().toLowerCase()).filter(tag => tag.length))]})
            }
            Repeater {
                model: root.metadata ? ["name", "description", "tool_name", "run_mode", "workspace_id"] : []
                ColumnLayout {
                    id: field
                    required property string modelData
                    Layout.fillWidth: true
                    Ui.Text {
                        text: ({name: "Name", description: "Description", tool_name: "Tool name", run_mode: "Run mode (workflow, chat, app or tool)", workspace_id: "Workspace ID"})[field.modelData]
                        role: Ui.Typography.SansLabel
                    }
                    Ui.TextField {
                        objectName: "metadata-" + field.modelData
                        Layout.fillWidth: true
                        accessibleName: field.modelData
                        value: root.controller.metadata[field.modelData] || (field.modelData === "run_mode" ? "workflow" : "")
                        enabled: root.controller.available
                        onValueCommitted: value => {
                            let patch = {}
                            patch[field.modelData] = value
                            root.controller.saveMetadata(patch)
                        }
                    }
                }
            }
        }
    }
}

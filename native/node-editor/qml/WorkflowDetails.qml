pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
Rectangle {
 id: root
 required property var controller
 required property string kind
 color: Ui.Theme.surfacePanel
 Basic.ScrollView {
  anchors.fill: parent
  anchors.margins: Ui.Metrics.xl
  contentWidth: availableWidth
  clip: true
  ColumnLayout {
   width: parent.width
   spacing: Ui.Metrics.md
   Ui.Text { text: root.kind === "versions" ? "Version history" : root.kind === "sharing" ? "Share workflow" : "Workflow metadata"; role: Ui.Typography.SansTitle }
   Ui.Text { visible: !root.controller.available; text: "Save this local workflow to a server first."; role: Ui.Typography.SansBody; Layout.fillWidth: true; wrapMode: Text.Wrap }
   Ui.Text { visible: root.controller.busy; text: "Loading…"; role: Ui.Typography.SansBody }
   Ui.Text { objectName: "versions-error"; text: root.controller.error; visible: text !== ""; role: Ui.Typography.SansBody; Layout.fillWidth: true; wrapMode: Text.WrapAnywhere }
   Ui.EditorButton { text: "Refresh"; enabled: root.controller.available && !root.controller.busy; onClicked: root.controller.load(root.kind) }
   Ui.TextArea { objectName: "version-preview"; visible: root.kind === "sharing"; Layout.fillWidth: true; readOnly: true; text: root.controller.preview; accessibleName: "Read-only server details" }
   Repeater {
    model: root.kind === "sharing" ? ["viewer", "editor", "public"] : []
    Ui.EditorButton { required property string modelData; objectName: "create-share-" + modelData; text: "Create " + modelData + " link"; enabled: root.controller.available && !root.controller.busy; onClicked: root.controller.createLink(modelData) }
   }
   Repeater {
    model: root.kind === "sharing" ? root.controller.rows : []
    ColumnLayout {
     id: shareRow
     required property var modelData
     Layout.fillWidth: true
     Ui.TextArea { Layout.fillWidth: true; readOnly: true; text: shareRow.modelData.kind === "link" ? shareRow.modelData.role + ": " + shareRow.modelData.url : shareRow.modelData.user_id + ": " + shareRow.modelData.role }
     Ui.EditorButton { text: shareRow.modelData.kind === "link" ? "Revoke link" : "Remove collaborator"; enabled: !root.controller.busy; onClicked: root.controller.sharingAction(shareRow.modelData.kind === "link" ? "revokeLink" : "removeCollaborator", shareRow.modelData.kind === "link" ? {share_id: shareRow.modelData.id} : {user_id: shareRow.modelData.user_id}) }
     Ui.EditorButton { visible: shareRow.modelData.kind === "collaborator"; text: shareRow.modelData.role === "viewer" ? "Allow editing" : "Allow viewing only"; enabled: !root.controller.busy; onClicked: root.controller.sharingAction("setRole", {user_id: shareRow.modelData.user_id, role: shareRow.modelData.role === "viewer" ? "editor" : "viewer"}) }
    }
   }
   Ui.Text { visible: root.kind === "sharing"; text: "Only the owner can manage sharing. Public links allow unauthenticated reading."; role: Ui.Typography.SansCaption; Layout.fillWidth: true; wrapMode: Text.Wrap }
   Ui.Text { visible: root.kind === "metadata"; text: "Tags"; role: Ui.Typography.SansLabel }
   Ui.TextField { visible: root.kind === "metadata"; Layout.fillWidth: true; placeholderText: "Separate tags with commas"; accessibleName: "Tags separated by commas"; value: (root.controller.metadata.tags || []).join(", "); enabled: root.controller.available; onValueCommitted: value => root.controller.saveMetadata({tags: [...new Set(value.split(",").map(tag => tag.trim().toLowerCase()).filter(tag => tag.length))]}) }
   Repeater {
    model: root.kind === "metadata" ? ["name", "description", "tool_name", "run_mode", "workspace_id"] : []
    ColumnLayout {
     required property string modelData
     Layout.fillWidth: true
     Ui.Text { text: ({name: "Name", description: "Description", tool_name: "Tool name", run_mode: "Run mode (workflow, chat, app or tool)", workspace_id: "Workspace ID"})[parent.modelData]; role: Ui.Typography.SansLabel }
     Ui.TextField { objectName: "metadata-" + parent.modelData; Layout.fillWidth: true; accessibleName: parent.modelData; value: root.controller.metadata[parent.modelData] || (parent.modelData === "run_mode" ? "workflow" : ""); enabled: root.controller.available; onValueCommitted: value => { let patch = {}; patch[parent.modelData] = value; root.controller.saveMetadata(patch) } }
    }
   }
  }
 }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
Rectangle {
    id: root
    required property var controller
    required property string kind
    readonly property bool metadata: root.kind === "metadata"
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
                text: root.kind === "versions" ? "Version history" : "Workflow metadata"
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
                text: "Refresh"
                enabled: root.controller.available && !root.controller.busy
                onClicked: root.controller.load(root.kind)
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

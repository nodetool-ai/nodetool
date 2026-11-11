pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    EditorRoles { id: roles }
    color: roles.panel
    implicitWidth: Ui.Metrics.dialogCompactWidth
    readonly property bool pending: workflowBrowser.loading || workflowBrowser.busy || workflowBrowser.projectsLoading
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            Ui.Text { text: "Workflows"; role: Ui.Typography.SansLabel; Layout.fillWidth: true }
            NodeButton { objectName: "browser-refresh"; text: "Refresh"; variant: NodeButton.Flat; enabled: !root.pending; onClicked: workflowBrowser.refresh() }
            NodeButton { objectName: "browser-close"; accessibleName: "Close workflows"; iconName: "close"; variant: NodeButton.Flat; onClicked: editor.action("Workflows") }
        }
        NodeButton { visible: editor.connectionState === "Disconnected"; text: "Connect to server"; onClicked: editor.action("Connect") }
        Ui.TextField {
            objectName: "workflow-search"
            Layout.fillWidth: true
            value: workflowBrowser.search
            accessibleName: "Search workflows"
            placeholderText: "Search loaded workflows…"
            onTextEdited: workflowBrowser.search = text
            onEditCanceled: workflowBrowser.search = editBaseline
        }
        Ui.Select {
            objectName: "workflow-project"
            Layout.fillWidth: true
            accessibleName: "Workflow project"
            value: workflowBrowser.projectId
            options: [{label: "All projects", value: ""}].concat(workflowBrowser.projects.map(project => ({label: project.name, value: project.id})))
            enabled: !workflowBrowser.busy && !workflowBrowser.projectsLoading
            onValueCommitted: value => workflowBrowser.projectId = value
        }
        RowLayout {
            Layout.fillWidth: true
            Ui.TextField { id: newName; objectName: "new-workflow-name"; Layout.fillWidth: true; accessibleName: "New workflow name"; placeholderText: "New workflow name"; enabled: !root.pending }
            NodeButton { objectName: "create-workflow"; text: "Create"; enabled: !root.pending && newName.text.trim() !== ""; onClicked: { workflowBrowser.createWorkflow(newName.text); newName.text = "" } }
        }
        Ui.Text { text: workflowBrowser.projectsLoading ? "Loading projects…" : workflowBrowser.busy ? "Saving changes…" : "Loading workflows…"; visible: root.pending; role: Ui.Typography.SansCaption }
        RowLayout {
            visible: workflowBrowser.error !== ""
            Layout.fillWidth: true
            Ui.Text { text: workflowBrowser.error; role: Ui.Typography.SansCaption; tone: Ui.Text.Error; wrapMode: Text.WrapAnywhere; Layout.fillWidth: true }
            NodeButton { objectName: "browser-retry"; text: "Retry"; enabled: !root.pending; onClicked: editor.action("Refresh workflows") }
        }
        Ui.EmptyState { visible: !root.pending && !workflowBrowser.error && workflowBrowser.rows.length === 0; Layout.fillWidth: true; title: "No workflows found"; message: workflowBrowser.search ? "Try another name or load more workflows." : "Create a workflow or choose another project."; maxTextWidth: width }
        Flickable {
            id: scroll
            objectName: "workflow-browser-scroll"
            Layout.fillWidth: true
            Layout.fillHeight: true
            contentWidth: width
            contentHeight: rows.implicitHeight
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            ColumnLayout {
                id: rows
                width: scroll.width
                spacing: Ui.Metrics.lg
                Repeater {
                    model: workflowBrowser.rows
                    ColumnLayout {
                        id: workflow
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.xs
                        Ui.EditorButton { Layout.maximumWidth: rows.width; objectName: "open-workflow-" + workflow.modelData.id; text: workflow.modelData.name; accessibleName: "Open " + text; Layout.fillWidth: true; enabled: !workflowBrowser.busy; onClicked: editor.openWorkflow(workflow.modelData.id) }
                        Ui.Text { visible: text !== ""; text: workflow.modelData.description || ""; role: Ui.Typography.SansCaption; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        RowLayout {
                            Layout.fillWidth: true
                            Ui.TextField { id: rename; objectName: "workflow-name-" + workflow.modelData.id; value: workflow.modelData.name; accessibleName: "Rename " + workflow.modelData.name; Layout.fillWidth: true; enabled: !root.pending }
                            NodeButton { objectName: "rename-workflow-" + workflow.modelData.id; text: "Rename"; enabled: !root.pending && rename.text.trim() !== "" && rename.text !== workflow.modelData.name; onClicked: workflowBrowser.renameWorkflow(workflow.modelData.id, rename.text) }
                            NodeButton { objectName: "delete-workflow-" + workflow.modelData.id; text: "Delete"; variant: NodeButton.Flat; enabled: !root.pending; onClicked: editor.deleteWorkflow(workflow.modelData.id, workflow.modelData.name) }
                        }
                        Ui.Separator { Layout.fillWidth: true }
                    }
                }
                NodeButton { objectName: "load-more-workflows"; text: "Load more workflows"; Layout.fillWidth: true; visible: workflowBrowser.hasNext; enabled: !root.pending; onClicked: workflowBrowser.loadNext() }
            }
        }
    }
}

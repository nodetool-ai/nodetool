pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property WorkflowBrowserModel browser
    required property PanelLayout panels
    required property StatusModel status
    EditorRoles { id: roles }
    color: roles.panel
    implicitWidth: Ui.Metrics.dialogCompactWidth
    readonly property bool pending: root.browser.loading || root.browser.busy || root.browser.projectsLoading
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            Ui.Text { text: "Workflows"; role: Ui.Typography.SansLabel; Layout.fillWidth: true }
            Ui.EditorButton { objectName: "browser-refresh"; text: "Refresh"; variant: Ui.EditorButton.Outlined; flat: true; enabled: !root.pending; onClicked: root.browser.refresh() }
            Ui.EditorButton { objectName: "browser-close"; accessibleName: "Close workflows"; iconName: "close"; display: Basic.AbstractButton.IconOnly; variant: Ui.EditorButton.Outlined; flat: true; onClicked: root.panels.toggleBrowser() }
        }
        Ui.EditorButton { variant: Ui.EditorButton.Outlined; visible: !root.status.connected; text: "Connect to server"; onClicked: root.status.connectServer() }
        Ui.TextField {
            objectName: "workflow-search"
            Layout.fillWidth: true
            value: root.browser.search
            accessibleName: "Search workflows"
            placeholderText: "Search loaded workflows…"
            onTextEdited: root.browser.search = text
            onEditCanceled: root.browser.search = editBaseline
        }
        Ui.Select {
            objectName: "workflow-project"
            Layout.fillWidth: true
            accessibleName: "Workflow project"
            value: root.browser.projectId
            options: [{label: "All projects", value: ""}].concat(root.browser.projects.map(project => ({label: project.name, value: project.id})))
            enabled: !root.browser.busy && !root.browser.projectsLoading
            onValueCommitted: value => root.browser.projectId = value
        }
        RowLayout {
            Layout.fillWidth: true
            Ui.TextField { id: newName; objectName: "new-workflow-name"; Layout.fillWidth: true; accessibleName: "New workflow name"; placeholderText: "New workflow name"; enabled: !root.pending }
            Ui.EditorButton { variant: Ui.EditorButton.Outlined; objectName: "create-workflow"; text: "Create"; enabled: !root.pending && newName.text.trim() !== ""; onClicked: { root.browser.createWorkflow(newName.text); newName.text = "" } }
        }
        Ui.Text { text: root.browser.projectsLoading ? "Loading projects…" : root.browser.busy ? "Saving changes…" : "Loading workflows…"; visible: root.pending; role: Ui.Typography.SansCaption }
        RowLayout {
            visible: root.browser.error !== ""
            Layout.fillWidth: true
            Ui.Text { text: root.browser.error; role: Ui.Typography.SansCaption; tone: Ui.Text.Error; wrapMode: Text.WrapAnywhere; Layout.fillWidth: true }
            Ui.EditorButton { variant: Ui.EditorButton.Outlined; objectName: "browser-retry"; text: "Retry"; enabled: !root.pending; onClicked: root.browser.reload() }
        }
        Ui.EmptyState { visible: !root.pending && !root.browser.error && root.browser.rows.length === 0; Layout.fillWidth: true; title: "No workflows found"; message: root.browser.search ? "Try another name or load more workflows." : "Create a workflow or choose another project."; maxTextWidth: width }
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
                    model: root.browser.rows
                    ColumnLayout {
                        id: workflow
                        required property var modelData
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.xs
                        Ui.EditorButton { Layout.maximumWidth: rows.width; objectName: "open-workflow-" + workflow.modelData.id; text: workflow.modelData.name; accessibleName: "Open " + text; Layout.fillWidth: true; enabled: !root.browser.busy; onClicked: root.browser.open(workflow.modelData.id) }
                        Ui.Text { visible: text !== ""; text: workflow.modelData.description || ""; role: Ui.Typography.SansCaption; wrapMode: Text.Wrap; Layout.fillWidth: true }
                        RowLayout {
                            Layout.fillWidth: true
                            Ui.TextField { id: rename; objectName: "workflow-name-" + workflow.modelData.id; value: workflow.modelData.name; accessibleName: "Rename " + workflow.modelData.name; Layout.fillWidth: true; enabled: !root.pending }
                            Ui.EditorButton { variant: Ui.EditorButton.Outlined; objectName: "rename-workflow-" + workflow.modelData.id; text: "Rename"; enabled: !root.pending && rename.text.trim() !== "" && rename.text !== workflow.modelData.name; onClicked: root.browser.renameWorkflow(workflow.modelData.id, rename.text) }
                            Ui.EditorButton { objectName: "delete-workflow-" + workflow.modelData.id; text: "Delete"; variant: Ui.EditorButton.Outlined; flat: true; enabled: !root.pending; onClicked: root.browser.confirmDelete(workflow.modelData.id, workflow.modelData.name) }
                        }
                        Ui.Separator { Layout.fillWidth: true }
                    }
                }
                Ui.EditorButton { variant: Ui.EditorButton.Outlined; objectName: "load-more-workflows"; text: "Load more workflows"; Layout.fillWidth: true; visible: root.browser.hasNext; enabled: !root.pending; onClicked: root.browser.loadNext() }
            }
        }
    }
}

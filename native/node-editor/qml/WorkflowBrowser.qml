pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The workflow list: web/src/components/workflows/WorkflowList.tsx with its
// toolbar (WorkflowToolbar.tsx), rows (WorkflowListItem.tsx), day groups
// (WorkflowListView.tsx) and row menu (context_menus/WorkflowContextMenu.tsx).
Rectangle {
    id: root
    required property WorkflowBrowserModel browser
    required property PanelLayout panels
    required property StatusModel status
    EditorRoles { id: roles }
    color: roles.panel
    implicitWidth: Ui.Metrics.dialogCompactWidth
    readonly property bool pending: root.browser.loading || root.browser.busy || root.browser.projectsLoading
    // The row whose name is being renamed in place, and the row whose details are open.
    property string renamingId: ""
    property string editingId: ""
    readonly property var editing: root.browser.rows.find(row => row.id === root.editingId) || null
    // Run modes from WorkflowForm.tsx.
    readonly property var runModes: [{label: "Workflow", value: "workflow"}, {label: "Chat", value: "chat"}, {label: "App", value: "app"}, {label: "Tool", value: "tool"}]
    function emptyTitle() {
        if (root.browser.favoritesOnly) return "No favorite workflows"
        return root.browser.loadedCount > 0 ? "No matching workflows" : "No workflows yet"
    }
    function emptyMessage() {
        if (root.browser.favoritesOnly) return "Star a workflow to add it to your favorites."
        if (root.browser.loadedCount === 0) return "Create your first workflow above."
        const searching = root.browser.search !== ""
        const tagged = root.browser.selectedTags.length > 0
        if (searching && tagged) return "Try adjusting your search term or tag filters."
        if (searching) return "Try a different search term."
        if (tagged) return "Try removing some tag filters."
        return "No workflows match the current filters."
    }
    function tags(text) {
        return [...new Set(text.split(",").map(tag => tag.trim()).filter(tag => tag.length))]
    }
    function openMenu(row, item, x, y) {
        rowMenu.row = row
        rowMenu.returnFocusTo = item
        rowMenu.popupAt(item, x, y)
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            Ui.Text { text: "Workflows"; role: Ui.Typography.SansLabel; Layout.fillWidth: true }
            Ui.EditorButton { objectName: "browser-refresh"; text: "Refresh"; variant: Ui.EditorButton.Flat; density: Ui.EditorButton.Compact; enabled: !root.pending; onClicked: { root.browser.refresh(); root.browser.loadTriggers() } }
            Ui.ToolbarIconButton { objectName: "browser-close"; accessibleName: "Close workflows"; iconName: "close"; onClicked: root.panels.toggleBrowser() }
        }
        Ui.EditorButton { visible: !root.status.connected; text: "Connect to server"; onClicked: root.status.connectServer() }
        Ui.TextField {
            objectName: "workflow-search"
            Layout.fillWidth: true
            value: root.browser.search
            accessibleName: "Search workflows"
            placeholderText: "Search workflows"
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
            Ui.EditorButton { objectName: "create-workflow"; text: "Create"; density: Ui.EditorButton.Compact; enabled: !root.pending && newName.text.trim() !== ""; onClicked: { root.browser.createWorkflow(newName.text); newName.text = "" } }
        }
        // WorkflowToolbar.tsx.
        RowLayout {
            objectName: "workflow-toolbar"
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Ui.MenuButton {
                id: tagButton
                objectName: "workflow-tags"
                visible: root.browser.availableTags.length > 0
                display: Basic.AbstractButton.IconOnly
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                iconName: "categoryOutlined"
                accessibleName: "Filter by tags"
                active: root.browser.selectedTags.length > 0
                menu: tagMenu
                Ui.ContextMenu {
                    id: tagMenu
                    returnFocusTo: tagButton
                    Repeater {
                        model: root.browser.availableTags
                        delegate: Ui.MenuItem {
                            required property string modelData
                            objectName: "workflow-tag-" + modelData
                            text: modelData
                            checkable: true
                            checked: root.browser.selectedTags.includes(modelData)
                            onTriggered: root.browser.toggleTag(modelData)
                        }
                    }
                }
            }
            Ui.ToolbarIconButton {
                objectName: "workflow-delete-selected"
                visible: root.browser.selectedIds.length > 0
                iconName: "deleteOutline"
                iconTone: Ui.Text.Error
                accessibleName: root.browser.selectedIds.length === 1 ? "Delete 1 selected workflow" : "Delete " + root.browser.selectedIds.length + " selected workflows"
                enabled: !root.pending
                onClicked: root.browser.confirmDeleteSelected()
            }
            Ui.ToolbarIconButton {
                objectName: "workflow-selection-mode"
                iconName: "check"
                active: root.browser.selectionMode
                accessibleName: root.browser.selectionMode ? "Hide selection checkboxes" : "Show selection checkboxes"
                onClicked: root.browser.selectionMode = !root.browser.selectionMode
            }
            Ui.ToolbarIconButton {
                objectName: "workflow-favorites-only"
                iconName: root.browser.favoritesOnly ? "star" : "starBorder"
                iconTone: root.browser.favoritesOnly ? Ui.Text.Warning : Ui.Text.Primary
                active: root.browser.favoritesOnly
                accessibleName: root.browser.favoritesOnly ? "Show all workflows" : "Show favorites only"
                onClicked: root.browser.favoritesOnly = !root.browser.favoritesOnly
            }
            Ui.ToolbarIconButton {
                objectName: "workflow-graph-preview"
                iconName: "accountTree"
                active: root.browser.showGraphPreview
                accessibleName: root.browser.showGraphPreview ? "Hide graph preview" : "Show graph preview"
                onClicked: root.browser.showGraphPreview = !root.browser.showGraphPreview
            }
            Ui.MenuButton {
                id: sortButton
                objectName: "workflow-sort"
                display: Basic.AbstractButton.IconOnly
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                iconName: "filterList"
                accessibleName: "Sort by " + root.browser.sortBy
                menu: sortMenu
                Ui.ContextMenu {
                    id: sortMenu
                    returnFocusTo: sortButton
                    Ui.MenuItem { objectName: "workflow-sort-date"; text: "Sort by date"; checkable: true; checked: root.browser.sortBy === "date"; onTriggered: root.browser.sortBy = "date" }
                    Ui.MenuItem { objectName: "workflow-sort-name"; text: "Sort by name"; checkable: true; checked: root.browser.sortBy === "name"; onTriggered: root.browser.sortBy = "name" }
                }
            }
            Item { Layout.fillWidth: true }
        }
        Flow {
            objectName: "workflow-active-tags"
            visible: root.browser.selectedTags.length > 0
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Repeater {
                model: root.browser.selectedTags
                Ui.EditorButton {
                    required property string modelData
                    objectName: "workflow-active-tag-" + modelData
                    text: modelData
                    trailingIconName: "close"
                    density: Ui.EditorButton.Compact
                    accessibleName: "Remove tag filter " + modelData
                    onClicked: root.browser.toggleTag(modelData)
                }
            }
            Ui.ToolbarIconButton {
                objectName: "workflow-clear-tags"
                visible: root.browser.selectedTags.length > 1
                iconName: "closeOutlined"
                accessibleName: "Clear all tag filters"
                onClicked: root.browser.clearTags()
            }
        }
        Ui.Text { text: root.browser.projectsLoading ? "Loading projects…" : root.browser.busy ? "Saving changes…" : "Loading workflows…"; visible: root.pending; role: Ui.Typography.SansCaption }
        RowLayout {
            visible: root.browser.error !== ""
            Layout.fillWidth: true
            Ui.Text { text: root.browser.error; role: Ui.Typography.SansCaption; tone: Ui.Text.Error; wrapMode: Text.WrapAnywhere; Layout.fillWidth: true }
            Ui.EditorButton { objectName: "browser-retry"; text: "Retry"; density: Ui.EditorButton.Compact; enabled: !root.pending; onClicked: root.browser.reload() }
        }
        Ui.EmptyState { objectName: "workflow-empty"; visible: !root.pending && !root.browser.error && root.browser.rows.length === 0; Layout.fillWidth: true; title: root.emptyTitle(); message: root.emptyMessage(); maxTextWidth: width }
        // The web's WorkflowFormModal: name, description, tags, run mode, workspace and tool name.
        Ui.Surface {
            objectName: "workflow-edit-form"
            visible: root.editing !== null
            Layout.fillWidth: true
            implicitHeight: form.implicitHeight + Ui.Metrics.lg * 2
            ColumnLayout {
                id: form
                anchors.fill: parent
                anchors.margins: Ui.Metrics.lg
                spacing: Ui.Metrics.sm
                RowLayout {
                    Layout.fillWidth: true
                    Ui.Text { text: "Workflow settings"; role: Ui.Typography.SansLabel; Layout.fillWidth: true }
                    Ui.ToolbarIconButton { objectName: "workflow-edit-close"; iconName: "close"; accessibleName: "Close workflow settings"; onClicked: root.editingId = "" }
                }
                Ui.Text { text: "Name"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Ui.TextField { objectName: "workflow-edit-name"; Layout.fillWidth: true; accessibleName: "Name"; value: root.editing ? root.editing.name : ""; enabled: !root.pending; onValueCommitted: value => { if (value.trim() !== "" && value !== root.editing.name) root.browser.updateWorkflow(root.editingId, {name: value}) } }
                Ui.Text { text: "Description"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Ui.TextField { objectName: "workflow-edit-description"; Layout.fillWidth: true; accessibleName: "Description"; value: root.editing ? (root.editing.description || "") : ""; enabled: !root.pending; onValueCommitted: value => root.browser.updateWorkflow(root.editingId, {description: value}) }
                Ui.Text { text: "Tags"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Ui.TextField { objectName: "workflow-edit-tags"; Layout.fillWidth: true; accessibleName: "Tags separated by commas"; placeholderText: "Separate tags with commas"; value: root.editing ? (root.editing.tags || []).join(", ") : ""; enabled: !root.pending; onValueCommitted: value => root.browser.updateWorkflow(root.editingId, {tags: root.tags(value)}) }
                Ui.Text { text: "Run mode"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Ui.Select { objectName: "workflow-edit-run-mode"; Layout.fillWidth: true; accessibleName: "Run mode"; options: root.runModes; value: root.editing ? (root.editing.run_mode || "workflow") : "workflow"; enabled: !root.pending; onValueCommitted: value => root.browser.updateWorkflow(root.editingId, {run_mode: value}) }
                Ui.Text { text: "Workspace ID"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Ui.TextField { objectName: "workflow-edit-workspace"; Layout.fillWidth: true; accessibleName: "Workspace ID"; value: root.editing ? (root.editing.workspace_id || "") : ""; enabled: !root.pending; onValueCommitted: value => root.browser.updateWorkflow(root.editingId, {workspace_id: value}) }
                Ui.Text { text: "Tool name"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Ui.TextField { objectName: "workflow-edit-tool-name"; Layout.fillWidth: true; accessibleName: "Tool name"; value: root.editing ? (root.editing.tool_name || "") : ""; enabled: !root.pending; onValueCommitted: value => root.browser.updateWorkflow(root.editingId, {tool_name: value}) }
            }
        }
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
                spacing: Ui.Metrics.micro
                Repeater {
                    model: root.browser.rows
                    ColumnLayout {
                        id: workflow
                        required property var modelData
                        required property int index
                        readonly property string previousGroup: workflow.index > 0 ? root.browser.rows[workflow.index - 1].group : ""
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.micro
                        // WorkflowListView.tsx: a day header above the first row of each group.
                        Ui.Text {
                            objectName: "workflow-group-" + workflow.modelData.group
                            visible: workflow.modelData.group !== "" && workflow.modelData.group !== workflow.previousGroup
                            text: workflow.modelData.group
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                            font.capitalization: Font.AllUppercase
                            Layout.topMargin: workflow.index > 0 ? Ui.Metrics.sm : 0
                        }
                        Ui.ListRow {
                            id: row
                            objectName: "workflow-row-" + workflow.modelData.id
                            Layout.fillWidth: true
                            active: workflow.modelData.current || workflow.modelData.selected
                            accessibleName: (root.browser.selectionMode ? "Select workflow " : "Open workflow ") + workflow.modelData.name
                            Accessible.checkable: root.browser.selectionMode
                            Accessible.checked: workflow.modelData.selected
                            enabled: !root.browser.busy
                            // A double-click on the name renames in place, so a single click opens
                            // after the double-click interval, as WorkflowListItem.tsx defers it.
                            Timer { id: openDelay; interval: Qt.styleHints.mouseDoubleClickInterval; onTriggered: root.browser.open(workflow.modelData.id) }
                            onClicked: {
                                if (root.renamingId === workflow.modelData.id) return
                                if (root.browser.selectionMode) root.browser.toggleSelected(workflow.modelData.id)
                                else openDelay.restart()
                            }
                            onDoubleClicked: {
                                openDelay.stop()
                                if (!root.browser.selectionMode) root.renamingId = workflow.modelData.id
                            }
                            Keys.onReturnPressed: root.browser.selectionMode ? root.browser.toggleSelected(workflow.modelData.id) : root.browser.open(workflow.modelData.id)
                            Keys.onMenuPressed: root.openMenu(workflow.modelData, row, 0, row.height)
                            TapHandler { acceptedButtons: Qt.RightButton; onTapped: eventPoint => root.openMenu(workflow.modelData, row, eventPoint.position.x, eventPoint.position.y) }
                            HoverHandler { id: rowHover }
                            Ui.Tooltip {
                                trigger: row
                                visible: rowHover.hovered && root.renamingId !== workflow.modelData.id && !rowMenu.visible
                                text: [workflow.modelData.name, workflow.modelData.description || "", (workflow.modelData.tags || []).join(", ")].filter(line => line !== "").join("\n")
                            }
                            ColumnLayout {
                                width: row.availableWidth
                                spacing: Ui.Metrics.xs
                                VersionGraphPreview {
                                    objectName: "workflow-preview-" + workflow.modelData.id
                                    visible: root.browser.showGraphPreview
                                    graph: workflow.modelData.graph || ({nodes: [], edges: []})
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: Ui.Metrics.touch * 2
                                }
                                RowLayout {
                                    Layout.fillWidth: true
                                    spacing: Ui.Metrics.sm
                                    Ui.CheckBox {
                                        objectName: "workflow-select-" + workflow.modelData.id
                                        visible: root.browser.selectionMode
                                        checked: workflow.modelData.selected
                                        accessibleName: "Select workflow " + workflow.modelData.name
                                        onToggled: root.browser.toggleSelected(workflow.modelData.id)
                                    }
                                    Ui.Text {
                                        objectName: "workflow-name-" + workflow.modelData.id
                                        visible: root.renamingId !== workflow.modelData.id
                                        text: workflow.modelData.name
                                        role: Ui.Typography.SansLabel
                                        elide: Text.ElideRight
                                        Layout.fillWidth: true
                                    }
                                    Ui.TextField {
                                        id: rename
                                        objectName: "workflow-rename-" + workflow.modelData.id
                                        visible: root.renamingId === workflow.modelData.id
                                        value: workflow.modelData.name
                                        accessibleName: "Workflow name"
                                        Layout.fillWidth: true
                                        onVisibleChanged: if (visible) { forceActiveFocus(); selectAll() }
                                        onValueCommitted: value => {
                                            root.renamingId = ""
                                            if (value.trim() !== "" && value !== workflow.modelData.name) root.browser.renameWorkflow(workflow.modelData.id, value)
                                        }
                                        // TextField reports nothing for an unchanged name, so Enter, Escape and
                                        // leaving the field end the rename here.
                                        onEditCanceled: root.renamingId = ""
                                        onAccepted: root.renamingId = ""
                                        Keys.onEscapePressed: root.renamingId = ""
                                        onActiveFocusChanged: if (!activeFocus && visible) root.renamingId = ""
                                    }
                                    // WorkflowTriggerIndicator.tsx.
                                    Ui.Icon {
                                        id: triggerIcon
                                        objectName: "workflow-trigger-" + workflow.modelData.id
                                        visible: !!workflow.modelData.trigger && !!workflow.modelData.trigger.label
                                        name: "power"
                                        size: Ui.Metrics.iconSm
                                        tone: workflow.modelData.trigger && workflow.modelData.trigger.failing ? Ui.Text.Error : Ui.Text.Success
                                        Accessible.role: Accessible.Graphic
                                        Accessible.name: workflow.modelData.trigger ? workflow.modelData.trigger.label : ""
                                        HoverHandler { id: triggerHover }
                                        Ui.Tooltip { trigger: triggerIcon; visible: triggerHover.hovered; text: triggerIcon.Accessible.name }
                                    }
                                    Ui.Text {
                                        objectName: "workflow-date-" + workflow.modelData.id
                                        visible: root.browser.sortBy === "name" && !rowHover.hovered && !row.activeFocus
                                        text: workflow.modelData.updatedLabel
                                        role: Ui.Typography.SansCaption
                                        tone: Ui.Text.Secondary
                                        font.capitalization: Font.AllUppercase
                                    }
                                    // The favourite star shows on a favourite, and on hover or focus to add one.
                                    Ui.ToolbarIconButton {
                                        objectName: "workflow-favorite-" + workflow.modelData.id
                                        visible: workflow.modelData.favorite || rowHover.hovered || row.activeFocus || activeFocus
                                        iconName: workflow.modelData.favorite ? "star" : "starBorder"
                                        iconTone: workflow.modelData.favorite ? Ui.Text.Warning : Ui.Text.Secondary
                                        accessibleName: workflow.modelData.favorite ? "Remove from favorites" : "Add to favorites"
                                        onClicked: root.browser.toggleFavorite(workflow.modelData.id)
                                    }
                                    Ui.ToolbarIconButton {
                                        id: more
                                        objectName: "workflow-more-" + workflow.modelData.id
                                        visible: rowHover.hovered || row.activeFocus || activeFocus || (rowMenu.visible && rowMenu.row && rowMenu.row.id === workflow.modelData.id)
                                        iconName: "moreVert"
                                        accessibleName: "Workflow actions for " + workflow.modelData.name
                                        onClicked: root.openMenu(workflow.modelData, more, 0, more.height)
                                    }
                                }
                            }
                        }
                    }
                }
                Ui.EditorButton { objectName: "load-more-workflows"; text: "Load more workflows"; Layout.fillWidth: true; visible: root.browser.hasNext; enabled: !root.pending; onClicked: root.browser.loadNext() }
            }
        }
    }
    // WorkflowContextMenu.tsx.
    Ui.ContextMenu {
        id: rowMenu
        objectName: "workflow-menu"
        property var row: null
        Ui.MenuItem { objectName: "workflow-menu-favorite"; text: rowMenu.row && rowMenu.row.favorite ? "Remove from favorites" : "Add to favorites"; iconName: rowMenu.row && rowMenu.row.favorite ? "star" : "starBorder"; onTriggered: root.browser.toggleFavorite(rowMenu.row.id) }
        Ui.MenuItem { objectName: "workflow-menu-rename"; text: "Rename"; iconName: "rename"; enabled: !root.pending; onTriggered: root.renamingId = rowMenu.row.id }
        Ui.MenuItem { objectName: "workflow-menu-edit"; text: "Edit"; iconName: "editOutlined"; onTriggered: root.editingId = rowMenu.row.id }
        Ui.MenuItem { objectName: "workflow-menu-duplicate"; text: "Duplicate"; iconName: "duplicate"; enabled: !root.pending; onTriggered: root.browser.duplicateWorkflow(rowMenu.row.id) }
        Basic.MenuSeparator { padding: Ui.Metrics.xs; contentItem: Ui.Separator {} }
        Ui.MenuItem { objectName: "workflow-menu-delete"; text: "Delete"; iconName: "deleteOutline"; iconTone: Ui.Text.Error; textTone: Ui.Text.Error; enabled: !root.pending; onTriggered: root.browser.confirmDelete(rowMenu.row.id, rowMenu.row.name) }
    }
}

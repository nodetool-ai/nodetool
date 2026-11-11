import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "TimelineListPanel"
    property var controller: null
    property bool autoRefresh: true
    property bool dismissOnEscape: false
    signal dismissRequested()
    // Used by the offscreen layout fixture, never populated by the application.
    property var previewDocuments: null
    property string activeTimelineId: ""
    readonly property var documents: previewDocuments !== null ? previewDocuments : controller ? controller.documents : []
    width: 320
    height: 640
    color: Ui.Theme.surfaceCanvas
    Component.onCompleted: { if (autoRefresh && controller) Qt.callLater(controller.refresh) }

    component TimelineListItem: Ui.ListRow {
        id: row
        required property var document
        property bool editing: false
        readonly property real iconGap: Ui.Metrics.xs
        signal opened()
        signal contextRequested()
        signal renamed(string name)
        signal renameCancelled()
        objectName: "TimelineListItem_" + document.id
        implicitHeight: Ui.Metrics.compact
        activeFocusOnTab: true
        accessibleName: document.name || "Untitled video"
        onClicked: if (!editing) opened()
        Keys.onMenuPressed: contextRequested()
        Keys.onPressed: event => {
            if (event.key === Qt.Key_F10 && (event.modifiers & Qt.ShiftModifier)) {
                contextRequested()
                event.accepted = true
            }
        }
        Ui.Icon {
            objectName: "listPanelIcon"
            x: 0
            anchors.verticalCenter: parent.verticalCenter
            size: Ui.Metrics.iconLg
            name: "movieOutlined"
        }
        Ui.Text {
            x: Ui.Metrics.iconLg + row.iconGap
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - x
            visible: !row.editing
            text: row.document.name || "Untitled video"
            elide: Text.ElideRight
            role: Ui.Typography.SansLabel
        }
        TapHandler { enabled: !row.editing; acceptedButtons: Qt.RightButton; onTapped: row.contextRequested() }
        Ui.TextField {
            id: rename
            x: Ui.Metrics.iconLg + row.iconGap
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - x
            visible: row.editing
            value: row.document.name
            accessibleName: "Timeline name"
            density: Ui.EditorButton.Compact
            onVisibleChanged: { if (visible) { forceActiveFocus(); selectAll() } }
            onValueCommitted: value => row.renamed(value)
            onEditCanceled: row.renameCancelled()
        }
    }
    component DocumentListPanel: Item {
        id: panel
        required property var listController
        required property var documents
        property string activeId: ""
        property string editingId: ""
        property string menuId: ""
        property string query: ""
        readonly property bool busy: listController ? listController.busy : false
        readonly property string errorMessage: listController ? listController.error : ""
        readonly property var rows: {
            const needle = search.text.trim().toLowerCase()
            return documents.filter(d => !needle || d.name.toLowerCase().includes(needle))
        }
        objectName: "DocumentListPanel"
        Item {
            id: searchContainer
            width: parent.width
            height: Ui.Metrics.touch
            Ui.Icon {
                id: searchIcon
                x: Ui.Metrics.md
                anchors.verticalCenter: search.verticalCenter
                size: Ui.Metrics.iconLg
                tone: Ui.Text.Disabled
                name: "search"
            }
            Ui.TextField {
                id: search
                objectName: "searchInput"
                y: Ui.Metrics.md
                x: searchIcon.x + searchIcon.width + Ui.Metrics.sm
                width: Math.max(0, parent.width - x - (clearSearch.visible ? clearSearch.width + Ui.Metrics.sm : Ui.Metrics.md))
                density: Ui.EditorButton.Compact
                placeholderText: "Search timelines"
                value: panel.query
                onValuePreviewed: value => panel.query = value
                onValueCommitted: value => panel.query = value
                accessibleName: "Search timelines"
                Component.onCompleted: forceActiveFocus()
                Keys.onEscapePressed: event => {
                    if (root.dismissOnEscape) {
                        root.dismissRequested()
                        event.accepted = true
                    } else if (text) {
                        panel.query = ""
                        clear()
                        event.accepted = true
                    }
                }
            }
            Ui.ToolbarIconButton {
                id: clearSearch
                anchors.right: parent.right
                anchors.verticalCenter: search.verticalCenter
                visible: !!search.text
                iconName: "close"
                accessibleName: "Clear search"
                onClicked: { panel.query = ""; search.clear(); search.forceActiveFocus() }
            }
        }
        Controls.ScrollView {
            y: searchContainer.height
            width: parent.width
            height: parent.height - y
            visible: !panel.busy && panel.rows.length > 0
            contentWidth: availableWidth
            clip: true
            Controls.ScrollBar.horizontal.policy: Controls.ScrollBar.AlwaysOff
            Column {
                width: parent.width - Ui.Metrics.micro
                spacing: Ui.Metrics.micro
                Repeater {
                    model: panel.rows
                    delegate: Column {
                        required property var modelData
                        required property int index
                        width: parent.width
                        Item {
                            width: parent.width
                            height: visible ? 28 : 0 // date-header-row: 8px / 4px + 11px caption line
                            visible: index === 0 || panel.rows[index - 1].group !== modelData.group
                            Ui.Text {
                                x: Ui.Metrics.md
                                y: Ui.Metrics.md
                                text: (modelData.group || "").toUpperCase()
                                tone: Ui.Text.Secondary
                                role: Ui.Typography.SansCaption
                            }
                        }
                        TimelineListItem {
                            width: parent.width
                            height: implicitHeight
                            document: modelData
                            active: modelData.id === panel.activeId
                            editing: modelData.id === panel.editingId
                            onOpened: { if (panel.listController) panel.listController.openTimeline(modelData.id) }
                            onContextRequested: {
                                panel.menuId = modelData.id
                                contextMenu.openAt(this)
                            }
                            onRenamed: name => {
                                if (panel.editingId !== modelData.id) return
                                panel.editingId = ""
                                if (panel.listController) panel.listController.renameTimeline(modelData.id, name)
                            }
                            onRenameCancelled: panel.editingId = ""
                        }
                    }
                }
            }
        }
        Column {
            anchors.centerIn: parent
            width: parent.width - 16
            spacing: Ui.Metrics.md
            visible: panel.busy || panel.rows.length === 0
            Ui.Text {
                objectName: "emptyTitle"
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                text: panel.busy ? "Loading timelines" : panel.errorMessage ? "Could not load timelines" : search.text ? "No matching timelines" : "No timelines yet"
                role: Ui.Typography.SansBody
            }
            Ui.Text {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                text: panel.busy ? "" : panel.errorMessage || (search.text ? "Try a different search term." : "Create a new video timeline with the + button above.")
                tone: Ui.Text.Secondary
                role: Ui.Typography.SansLabel
            }
        }
        // Mutation failures keep the rows visible and show the server's error.
        Ui.Text {
            anchors.bottom: parent.bottom
            width: parent.width
            visible: panel.errorMessage !== "" && panel.rows.length > 0
            text: panel.errorMessage
            wrapMode: Text.WordWrap
            tone: Ui.Text.Error
            role: Ui.Typography.SansLabel
        }
        Ui.ContextMenu {
            id: contextMenu
            Ui.MenuItem { text: "Rename"; onTriggered: panel.editingId = panel.menuId }
            Ui.MenuItem { text: "Delete"; onTriggered: { if (panel.listController) panel.listController.requestDelete(panel.menuId) } }
        }
    }
    Item {
        id: projectSelector
        width: parent.width
        height: root.controller && root.controller.projects.length > 1 ? 36 : 0
        visible: height > 0
        Ui.Select {
            anchors.fill: parent
            anchors.margins: Ui.Metrics.xs
            options: root.controller ? root.controller.projects.map(project => ({label: project.name, value: project.id})) : []
            value: root.controller ? root.controller.projectId : ""
            accessibleName: "Project"
            onValueCommitted: value => { if (root.controller) root.controller.projectId = value }
        }
    }
    Item {
        id: header
        objectName: "panelHeader"
        y: projectSelector.height
        width: parent.width
        height: Ui.Metrics.comfortable
        Ui.PanelHeader {
            anchors.fill: parent
            anchors.leftMargin: Ui.Metrics.lg
            anchors.rightMargin: Ui.Metrics.lg
            text: "Timelines"
            ProjectSettingsDialog.TimelineListButton {
                objectName: "createTimeline"
                iconName: "add"
                accessibleLabel: "New timeline"
                enabled: root.controller && !root.controller.busy && !!root.controller.projectId
                onClicked: {
                    const created = root.controller.createTimeline()
                    if (created.id) root.controller.openTimeline(created.id)
                }
            }
        }
        Ui.Separator { anchors.bottom: parent.bottom; width: parent.width }
    }
    DocumentListPanel {
        id: documentListPanel
        x: Ui.Metrics.lg
        y: header.y + header.height
        width: parent.width - 2 * Ui.Metrics.lg
        height: parent.height - y
        documents: root.documents
        listController: root.controller
        activeId: root.activeTimelineId
    }
    ProjectSettingsDialog.TimelineListDialog {
        title: "Delete timeline"
        returnFocusTo: documentListPanel
        confirmText: "Delete"
        destructive: true
        visible: root.controller && !!root.controller.deleteTarget.id
        busy: root.controller ? root.controller.busy : false
        onConfirmed: { if (root.controller) root.controller.confirmDelete() }
        onCancelled: { if (root.controller) root.controller.cancelDelete() }
        content: Ui.Text {
            width: parent.width
            wrapMode: Text.WordWrap
            text: 'Delete "' + (root.controller ? root.controller.deleteTarget.name || "Untitled video" : "") + '"? This cannot be undone.'
            role: Ui.Typography.SansBody
        }
    }
}

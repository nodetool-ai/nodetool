import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline

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
    color: Theme.backgroundDefault
    Component.onCompleted: { if (autoRefresh && controller) Qt.callLater(controller.refresh) }

    component TimelineListItem: FocusScope {
        id: row
        required property var document
        property bool active: false
        property bool editing: false
        readonly property int padding: 4 // listPanelStyles theme.spacing(1), theme spacing=4
        readonly property int iconGap: 4 // ListPanelItem FlexRow gap={1}
        signal opened()
        signal contextRequested()
        signal renamed(string name)
        signal renameCancelled()
        objectName: "TimelineListItem_" + document.id
        implicitHeight: 28 // 20px icon + 2 * 4px row padding
        activeFocusOnTab: true
        Accessible.role: Accessible.Button
        Accessible.name: document.name || "Untitled video"
        Keys.onReturnPressed: opened()
        Keys.onSpacePressed: opened()
        Keys.onMenuPressed: contextRequested()
        Keys.onPressed: event => {
            if (event.key === Qt.Key_F10 && (event.modifiers & Qt.ShiftModifier)) {
                contextRequested()
                event.accepted = true
            }
        }
        Rectangle {
            anchors.fill: parent
            radius: Theme.radiusMd
            color: row.active ? Theme.actionSelected : hover.hovered ? Theme.actionHover : "transparent"
            border.width: row.activeFocus && !row.editing ? 2 : 0
            border.color: Theme.primary
        }
        Icon {
            objectName: "listPanelIcon"
            x: row.padding
            anchors.verticalCenter: parent.verticalCenter
            size: 20 // listPanelStyles .list-panel-icon
            // MovieOutlined from the web TimelineListItem.
            path: "M4 6.47 5.76 10H20v8H4zM22 4h-4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2z"
            color: Theme.textSecondary
        }
        Text {
            x: row.padding + 20 + row.iconGap
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - x - row.padding
            visible: !row.editing
            text: row.document.name || "Untitled video"
            elide: Text.ElideRight
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
            lineHeight: 1.35
        }
        HoverHandler { id: hover; cursorShape: Qt.PointingHandCursor }
        TapHandler { enabled: !row.editing; onTapped: { row.forceActiveFocus(); row.opened() } }
        TapHandler { enabled: !row.editing; acceptedButtons: Qt.RightButton; onTapped: row.contextRequested() }
        Controls.TextField {
            id: rename
            x: row.padding + 20 + row.iconGap
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - x - row.padding
            height: row.height
            visible: row.editing
            text: row.document.name
            color: Theme.textPrimary
            selectionColor: Theme.primary
            selectedTextColor: Theme.textPrimary
            leftPadding: Theme.spacingMd
            rightPadding: Theme.spacingMd
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
            selectByMouse: true
            Accessible.name: "Timeline name"
            background: Rectangle { color: "transparent"; radius: Theme.radiusSm; border.color: Theme.primary; border.width: 1 }
            onVisibleChanged: { if (visible) { text = row.document.name; forceActiveFocus(); selectAll() } }
            onAccepted: row.renamed(text)
            onActiveFocusChanged: { if (!activeFocus && row.editing) row.renamed(text) }
            Keys.onEscapePressed: event => { row.renameCancelled(); event.accepted = true }
        }
    }
    component DocumentListPanel: Item {
        id: panel
        required property var listController
        required property var documents
        property string activeId: ""
        property string editingId: ""
        property string menuId: ""
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
            height: 44 // listPanelStyles: 8px top/bottom + SearchInput CONTROL.height.sm
            Controls.TextField {
                id: search
                objectName: "searchInput"
                y: Theme.spacingMd
                width: parent.width
                height: 28
                placeholderText: "Search timelines"
                placeholderTextColor: Theme.textDisabled
                color: Theme.textPrimary
                selectionColor: Theme.primary
                selectedTextColor: Theme.textPrimary
                leftPadding: 32
                rightPadding: text ? 28 : Theme.spacingMd
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeNormal
                Accessible.name: "Search timelines"
                selectByMouse: true
                Component.onCompleted: forceActiveFocus()
                background: Rectangle { color: Theme.overlay; border.width: 1; border.color: search.activeFocus ? Theme.primary : Theme.divider; radius: Theme.radiusMd }
                Icon {
                    x: Theme.spacingMd
                    anchors.verticalCenter: parent.verticalCenter
                    size: 20
                    color: Theme.textDisabled
                    path: "M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14"
                }
                ProjectSettingsDialog.TimelineListButton {
                    anchors.right: parent.right
                    visible: !!search.text
                    iconPath: Icons.close
                    accessibleLabel: "Clear search"
                    onClicked: { search.clear(); search.forceActiveFocus() }
                }
                Keys.onEscapePressed: event => {
                    if (root.dismissOnEscape) {
                        root.dismissRequested()
                        event.accepted = true
                    } else if (text) {
                        clear()
                        event.accepted = true
                    }
                }
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
                width: parent.width - Theme.spacingMicro
                spacing: Theme.spacingMicro
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
                            Text {
                                x: Theme.spacingMd
                                y: Theme.spacingMd
                                text: (modelData.group || "").toUpperCase()
                                color: Theme.textSecondary
                                font.family: Theme.sansFamily
                                font.pixelSize: Theme.fontSizeSmaller
                                font.letterSpacing: 0.66
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
                                contextMenu.popup(this, 0, height)
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
            spacing: Theme.spacingMd
            visible: panel.busy || panel.rows.length === 0
            Text {
                objectName: "emptyTitle"
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                text: panel.busy ? "Loading timelines" : panel.errorMessage ? "Could not load timelines" : search.text ? "No matching timelines" : "No timelines yet"
                color: Theme.textPrimary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeNormal
            }
            Text {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                text: panel.busy ? "" : panel.errorMessage || (search.text ? "Try a different search term." : "Create a new video timeline with the + button above.")
                color: Theme.textSecondary
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
            }
        }
        // Mutation failures keep the rows visible and show the server's error.
        Text {
            anchors.bottom: parent.bottom
            width: parent.width
            visible: panel.errorMessage !== "" && panel.rows.length > 0
            text: panel.errorMessage
            wrapMode: Text.WordWrap
            color: Theme.error
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
        }
        Controls.Menu {
            id: contextMenu
            Controls.MenuItem { text: "Rename"; onTriggered: panel.editingId = panel.menuId }
            Controls.MenuItem { text: "Delete"; onTriggered: { if (panel.listController) panel.listController.requestDelete(panel.menuId) } }
        }
    }
    Item {
        id: projectSelector
        width: parent.width
        height: root.controller && root.controller.projects.length > 1 ? 36 : 0
        visible: height > 0
        Controls.ComboBox {
            anchors.fill: parent
            anchors.margins: Theme.spacingXs
            model: root.controller ? root.controller.projects : []
            textRole: "name"
            valueRole: "id"
            Accessible.name: "Project"
            currentIndex: {
                if (!root.controller) return -1
                for (let i = 0; i < root.controller.projects.length; ++i) {
                    if (root.controller.projects[i].id === root.controller.projectId) return i
                }
                return -1
            }
            onActivated: { if (root.controller) root.controller.projectId = currentValue }
        }
    }
    Rectangle {
        id: header
        objectName: "panelHeader"
        y: projectSelector.height
        width: parent.width
        height: 36 // PanelHeader PANEL_HEADER_HEIGHT
        color: Theme.backgroundDefault
        Text {
            x: Theme.spacingLg
            anchors.verticalCenter: parent.verticalCenter
            text: "Timelines"
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
        }
        ProjectSettingsDialog.TimelineListButton {
            objectName: "createTimeline"
            anchors.right: parent.right
            anchors.rightMargin: Theme.spacingLg
            anchors.verticalCenter: parent.verticalCenter
            iconPath: Icons.add
            accessibleLabel: "New timeline"
            enabled: root.controller && !root.controller.busy && !!root.controller.projectId
            onClicked: {
                const created = root.controller.createTimeline()
                if (created.id) root.controller.openTimeline(created.id)
            }
        }
        Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.divider }
    }
    DocumentListPanel {
        id: documentListPanel
        x: Theme.spacingLg
        y: header.y + header.height
        width: parent.width - 2 * Theme.spacingLg
        height: parent.height - y
        documents: root.documents
        listController: root.controller
        activeId: root.activeTimelineId
    }
    ProjectSettingsDialog.TimelineListDialog {
        anchors.fill: parent
        title: "Delete timeline"
        confirmText: "Delete"
        destructive: true
        opened: root.controller && !!root.controller.deleteTarget.id
        busy: root.controller ? root.controller.busy : false
        onConfirmed: { if (root.controller) root.controller.confirmDelete() }
        onCancelled: { if (root.controller) root.controller.cancelDelete() }
        content: Text {
            width: parent.width
            wrapMode: Text.WordWrap
            text: 'Delete "' + (root.controller ? root.controller.deleteTarget.name || "Untitled video" : "") + '"? This cannot be undone.'
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeNormal
        }
    }
}

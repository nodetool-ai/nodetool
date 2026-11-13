pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
Rectangle {
    id: root
    // The narrowest width at which every control keeps its label on one line.
    readonly property real minimumWidth: listColumn.Layout.minimumWidth + detailColumn.Layout.minimumWidth + Ui.Metrics.lg * 3
    // The web's All, Manual and Auto filter (VersionHistoryPanel.tsx, `filterType`). "autosave" is Auto.
    property string filterType: "all"
    // The web's compare mode: rows pick two versions to compare instead of inspecting one.
    property bool compareMode: false
    readonly property bool comparing: compareMode && root.controller.selectedIndex >= 0 && root.controller.compareIndex >= 0
    readonly property int shownCount: root.controller.rows.filter(row => matches(row)).length
    function matches(row) {
        return filterType === "all" || row.save_type === filterType
    }
    // Mirrors handleSelect and handleCompare in the web panel.
    function pick(index) {
        const selected = root.controller.selectedIndex
        if (selected === index) {
            root.controller.deselect()
        } else if (!compareMode || selected < 0) {
            root.controller.inspect(index)
        } else {
            root.controller.compareWith(index)
        }
    }
    function toggleCompare() {
        compareMode = !compareMode
        root.controller.compareWith(-1)
    }
    function clearComparison() {
        root.controller.deselect()
        compareMode = false
    }
    implicitWidth: Ui.Metrics.dialogCompactWidth * 2
    implicitHeight: Ui.Metrics.touch * 10
    signal closeRequested()
    required property var controller
    color: Ui.Theme.surfacePanel
    Binding {
        target: root.controller
        property: "panelMinimumWidth"
        value: root.minimumWidth
    }
    RowLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.lg
        ColumnLayout {
            id: listColumn
            Layout.preferredWidth: Ui.Metrics.dialogCompactWidth
            Layout.minimumWidth: Math.max(headerRow.implicitWidth, filterRow.implicitWidth)
            Layout.fillHeight: true
            RowLayout {
                id: headerRow
                Layout.fillWidth: true
                spacing: Ui.Metrics.md
                Ui.Text {
                    text: "Version history"
                    role: Ui.Typography.SansTitle
                    Layout.fillWidth: true
                    Layout.minimumWidth: implicitWidth
                }
                Ui.Text {
                    objectName: "version-count"
                    text: root.shownCount
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.EditorButton {
                    objectName: "save-version"
                    text: "Save version"
                    variant: Ui.EditorButton.Primary
                    Layout.minimumWidth: implicitWidth
                    loading: root.controller.busy
                    enabled: root.controller.available && !root.controller.busy
                    onClicked: saveDialog.open()
                }
                Ui.ToolbarIconButton {
                    objectName: "versions-refresh"
                    iconName: "refresh"
                    accessibleName: "Refresh versions"
                    description: accessibleName
                    enabled: root.controller.available && !root.controller.busy
                    onClicked: root.controller.load("versions")
                }
                // The web's PanelHeader puts the close control last, after the actions.
                Ui.CloseButton {
                    objectName: "versions-close"
                    accessibleName: "Close version history"
                    description: accessibleName
                    onClicked: root.closeRequested()
                }
            }
            RowLayout {
                id: filterRow
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                Repeater {
                    model: [{key: "all", label: "All"}, {key: "manual", label: "Manual"}, {key: "autosave", label: "Auto"}]
                    Ui.EditorButton {
                        id: filterButton
                        required property var modelData
                        objectName: "version-filter-" + filterButton.modelData.key
                        text: filterButton.modelData.label
                        density: Ui.EditorButton.Compact
                        Layout.minimumWidth: implicitWidth
                        active: root.filterType === filterButton.modelData.key
                        accessibleName: "Show " + filterButton.modelData.label + " versions"
                        onClicked: root.filterType = filterButton.modelData.key
                    }
                }
                Item {
                    Layout.fillWidth: true
                }
                Ui.EditorButton {
                    objectName: "compare-clear"
                    text: "Clear"
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    Layout.minimumWidth: implicitWidth
                    visible: root.compareMode && (root.controller.selectedIndex >= 0 || root.controller.compareIndex >= 0)
                    onClicked: root.clearComparison()
                }
                Ui.EditorButton {
                    objectName: "compare-toggle"
                    text: "Compare"
                    density: Ui.EditorButton.Compact
                    Layout.minimumWidth: implicitWidth
                    active: root.compareMode
                    accessibleName: "Compare two versions side by side"
                    onClicked: root.toggleCompare()
                }
            }
            Ui.Text {
                objectName: "compare-hint"
                visible: root.compareMode && root.controller.compareIndex < 0
                text: root.controller.selectedIndex < 0 ? "Select the first version to compare" : "Select the second version to compare"
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Info
            }
            Ui.Text {
                visible: !root.controller.available
                text: "Save this local workflow to a server first."
                role: Ui.Typography.SansBody
            }
            Ui.Text {
                visible: root.controller.busy
                text: "Loading…"
                role: Ui.Typography.SansCaption
            }
            ColumnLayout {
                objectName: "versions-empty"
                visible: root.controller.available && !root.controller.busy && root.shownCount === 0
                Layout.fillWidth: true
                Ui.Text {
                    text: "No versions saved yet"
                    role: Ui.Typography.SansLabel
                }
                Ui.Text {
                    text: "Save your workflow to create a version"
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
            }
            Basic.ScrollView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                contentWidth: availableWidth
                clip: true
                ColumnLayout {
                    width: parent.width
                    Repeater {
                        model: root.controller.rows
                        ColumnLayout {
                            id: entry
                            required property var modelData
                            required property int index
                            readonly property bool selected: root.controller.selectedIndex === entry.index
                            readonly property bool showActions: entryHover.hovered || entry.selected
                            Layout.fillWidth: true
                            visible: root.matches(entry.modelData)
                            HoverHandler {
                                id: entryHover
                            }
                            RowLayout {
                                Layout.fillWidth: true
                                VersionGraphPreview {
                                    objectName: "version-thumbnail-" + entry.index
                                    graph: entry.modelData.graph || {}
                                    Layout.preferredWidth: Ui.Metrics.touch * 2
                                    Layout.preferredHeight: Ui.Metrics.touch
                                }
                                Ui.EditorButton {
                                    objectName: "version-row-" + entry.index
                                    Layout.fillWidth: true
                                    contentAlignment: Qt.AlignLeft
                                    text: "v" + entry.modelData.version + " · " + entry.modelData.save_label
                                    active: root.controller.selectedIndex === entry.index
                                    enabled: !root.controller.busy
                                    onClicked: root.pick(entry.index)
                                    // The second version of a comparison, as the web's secondary highlight.
                                    Rectangle {
                                        objectName: "version-compare-target-" + entry.index
                                        anchors.fill: parent
                                        visible: root.compareMode && root.controller.compareIndex === entry.index
                                        color: "transparent"
                                        radius: Ui.Metrics.radiusControl
                                        border.color: Ui.Theme.accentPrimary
                                        border.width: Ui.Metrics.focus
                                    }
                                }
                                // The web's hover actions (VersionListItem.tsx, HoverActionGroup). A selected
                                // row keeps them so the keyboard reaches them too.
                                Ui.ToolbarIconButton {
                                    objectName: "version-row-restore-" + entry.index
                                    // Hidden actions keep their space so the row does not reflow on hover.
                                    visible: !root.compareMode
                                    opacity: entry.showActions ? 1 : 0
                                    iconName: "history"
                                    accessibleName: "Restore this version"
                                    description: accessibleName
                                    enabled: entry.showActions && root.controller.available && !root.controller.busy
                                    onClicked: {
                                        root.controller.inspect(entry.index)
                                        root.controller.restore(confirmation.checked)
                                    }
                                }
                                Ui.ToolbarIconButton {
                                    objectName: "version-row-delete-" + entry.index
                                    visible: !root.compareMode
                                    opacity: entry.showActions ? 1 : 0
                                    iconName: "deleteOutline"
                                    accessibleName: "Delete"
                                    description: accessibleName
                                    enabled: entry.showActions && !root.controller.busy
                                    onClicked: {
                                        root.controller.inspect(entry.index)
                                        deleteConfirmation.open()
                                    }
                                }
                            }
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: Ui.Metrics.sm
                                Ui.Text {
                                    id: timeText
                                    objectName: "version-time-" + entry.index
                                    text: root.controller.relativeLabel(entry.modelData.created_at || "", root.controller.clock)
                                    role: Ui.Typography.SansCaption
                                    tone: Ui.Text.Secondary
                                    HoverHandler {
                                        id: timeHover
                                    }
                                    Ui.Tooltip {
                                        trigger: timeText
                                        visible: timeHover.hovered && entry.modelData.created_at
                                        text: root.controller.absoluteLabel(entry.modelData.created_at || "")
                                    }
                                }
                                Ui.Text {
                                    text: "· " + (entry.modelData.size_bytes / 1024).toFixed(1) + " KB"
                                    role: Ui.Typography.SansCaption
                                    tone: Ui.Text.Secondary
                                }
                            }
                            Ui.Text {
                                visible: text !== ""
                                text: entry.modelData.description || entry.modelData.name || ""
                                role: Ui.Typography.SansCaption
                                elide: Text.ElideRight
                                Layout.fillWidth: true
                            }
                        }
                    }
                }
            }
        }
        Basic.ScrollView {
            id: detailColumn
            readonly property var inspected: root.controller.rows[root.controller.selectedIndex]
            readonly property bool inspecting: root.controller.selectedIndex >= 0 && !root.comparing
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumWidth: Math.max(confirmation.implicitWidth, actionRow.implicitWidth)
            contentWidth: availableWidth
            clip: true
            ColumnLayout {
                width: parent.width
                spacing: Ui.Metrics.md
                Ui.Text {
                    objectName: "versions-error"
                    text: root.controller.error
                    visible: text !== ""
                    role: Ui.Typography.SansBody
                    tone: Ui.Text.Error
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
                // Nothing inspected: the web's prompt in place of the preview (VersionHistoryPanel.tsx,
                // selectToPreview with clickEntry or pickTwo).
                ColumnLayout {
                    objectName: "version-detail-empty"
                    visible: root.controller.selectedIndex < 0
                    Layout.fillWidth: true
                    Layout.topMargin: Ui.Metrics.touch * 2
                    spacing: Ui.Metrics.sm
                    Ui.Text {
                        text: "Select a version to preview"
                        role: Ui.Typography.SansBody
                        tone: Ui.Text.Secondary
                        horizontalAlignment: Text.AlignHCenter
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                    }
                    Ui.Text {
                        objectName: "version-detail-empty-hint"
                        text: root.compareMode ? "Pick two versions to see what changed." : "Click any entry to see its graph and metadata here."
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        horizontalAlignment: Text.AlignHCenter
                        Layout.fillWidth: true
                        wrapMode: Text.Wrap
                    }
                }
                // One inspected version: number, save type, time and size on one line, as the web does.
                Flow {
                    objectName: "version-detail-header"
                    visible: detailColumn.inspecting
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.md
                    Ui.Text {
                        objectName: "version-detail-number"
                        text: detailColumn.inspected ? "v" + detailColumn.inspected.version : ""
                        role: Ui.Typography.SansTitle
                    }
                    Ui.Text {
                        objectName: "version-detail-type"
                        text: detailColumn.inspected ? detailColumn.inspected.save_label : ""
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                    Ui.Text {
                        objectName: "version-detail-time"
                        text: {
                            const row = detailColumn.inspected
                            if (!row || !row.created_at) {
                                return "Time unavailable"
                            }
                            return root.controller.absoluteLabel(row.created_at) + " · " + root.controller.relativeLabel(row.created_at, root.controller.clock)
                        }
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                    Ui.Text {
                        text: detailColumn.inspected ? (detailColumn.inspected.size_bytes / 1024).toFixed(1) + " KB" : ""
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                    }
                }
                Ui.Text {
                    objectName: "version-detail-name"
                    visible: detailColumn.inspecting && text !== ""
                    text: detailColumn.inspected ? (detailColumn.inspected.name || "") : ""
                    role: Ui.Typography.SansLabel
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
                Ui.Text {
                    objectName: "version-detail-description"
                    visible: detailColumn.inspecting && text !== ""
                    text: detailColumn.inspected ? (detailColumn.inspected.description || "") : ""
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
                Ui.Text {
                    objectName: "version-diff-heading"
                    visible: root.comparing
                    text: root.comparing ? "Comparing v" + root.controller.comparison.oldVersion + " ↔ v" + root.controller.comparison.newVersion : ""
                    role: Ui.Typography.SansLabel
                    tone: Ui.Text.Secondary
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
                VersionGraphPreview {
                    objectName: "version-graph-preview"
                    visible: root.controller.selectedIndex >= 0
                    interactive: true
                    // Comparing two versions draws the visual diff in the preview's place, as the web does.
                    graph: root.comparing ? (root.controller.comparison.newGraph || {}) : root.controller.selectedGraph
                    oldGraph: root.comparing ? (root.controller.comparison.oldGraph || {}) : {}
                    diff: root.comparing ? root.controller.comparison : undefined
                    Layout.fillWidth: true
                    Layout.preferredHeight: Ui.Metrics.touch * 3
                }
                // Restore replaces the open document, so unsaved edits need an explicit yes first.
                Ui.CheckBox {
                    id: confirmation
                    objectName: "restore-confirm"
                    visible: detailColumn.inspecting
                    text: "Replace unsaved work"
                    Layout.minimumWidth: implicitWidth
                }
                RowLayout {
                    id: actionRow
                    visible: detailColumn.inspecting
                    Ui.EditorButton {
                        objectName: "restore-version"
                        text: "Restore this version"
                        variant: Ui.EditorButton.Primary
                        density: Ui.EditorButton.Compact
                        Layout.minimumWidth: implicitWidth
                        loading: root.controller.busy
                        enabled: root.controller.selectedIndex >= 0 && root.controller.available && !root.controller.busy
                        onClicked: root.controller.restore(confirmation.checked)
                    }
                    Ui.EditorButton {
                        objectName: "delete-selected-version"
                        text: "Delete"
                        variant: Ui.EditorButton.Flat
                        density: Ui.EditorButton.Compact
                        Layout.minimumWidth: implicitWidth
                        enabled: root.controller.selectedIndex >= 0 && !root.controller.busy
                        onClicked: deleteConfirmation.open()
                    }
                }
                // The web compares two picked versions. Native also lists what restoring the inspected
                // version would change in the open document.
                Ui.Text {
                    objectName: "version-diff-current-heading"
                    visible: detailColumn.inspecting
                    text: "Changes if restored"
                    role: Ui.Typography.SansLabel
                    Layout.fillWidth: true
                    Layout.topMargin: Ui.Metrics.md
                    wrapMode: Text.Wrap
                }
                Ui.Text {
                    objectName: "version-diff-empty"
                    visible: root.controller.selectedIndex >= 0 && !root.controller.comparison.hasChanges
                    text: "No changes detected"
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Repeater {
                    model: ["addedNodes", "removedNodes", "modifiedNodes", "addedEdges", "removedEdges", "modifiedEdges"]
                    ColumnLayout {
                        id: section
                        required property string modelData
                        readonly property var items: root.controller.comparison[modelData] || []
                        readonly property bool nodes: modelData.endsWith("Nodes")
                        objectName: "version-diff-" + modelData
                        Layout.fillWidth: true
                        visible: root.controller.selectedIndex >= 0 && items.length > 0
                        Ui.Text {
                            objectName: "version-diff-title-" + section.modelData
                            tone: section.modelData.startsWith("added") ? Ui.Text.Success : section.modelData.startsWith("removed") ? Ui.Text.Error : Ui.Text.Warning
                            // versionDiff in web/src/i18n/locales/en.json, singular for one item.
                            text: {
                                const one = section.items.length === 1
                                const label = ({
                                    addedNodes: one ? "Added node" : "Added nodes",
                                    removedNodes: one ? "Removed node" : "Removed nodes",
                                    modifiedNodes: one ? "Modified node" : "Modified nodes",
                                    addedEdges: one ? "Added connection" : "Added connections",
                                    removedEdges: one ? "Removed connection" : "Removed connections",
                                    modifiedEdges: one ? "Modified connection" : "Modified connections"
                                })[section.modelData]
                                return label + " (" + section.items.length + ")"
                            }
                            role: Ui.Typography.SansLabel
                        }
                        Repeater {
                            model: section.items
                            ColumnLayout {
                                id: change
                                required property var modelData
                                required property int index
                                Layout.fillWidth: true
                                spacing: 0
                                // A node shows the last segment of its type, as VersionDiff.tsx does,
                                // and a connection its shortened endpoints.
                                Ui.Text {
                                    objectName: "version-diff-item-" + section.modelData + "-" + change.index
                                    text: {
                                        const item = change.modelData
                                        if (section.nodes) {
                                            const type = String(item.type || "")
                                            const short = type.split(".").pop()
                                            const label = short !== "" ? short : "Node"
                                            const count = (item.changes || []).length
                                            return section.modelData === "modifiedNodes" ? label + " · " + count + (count === 1 ? " change" : " changes") : label
                                        }
                                        return String(item.source || "").substring(0, 8) + "… → " + String(item.target || "").substring(0, 8) + "…"
                                    }
                                    role: Ui.Typography.SansCaption
                                    Layout.fillWidth: true
                                    elide: Text.ElideRight
                                }
                                Ui.Text {
                                    visible: section.nodes && section.modelData !== "modifiedNodes"
                                    text: "ID: " + String(change.modelData.id || "").substring(0, 8) + "…"
                                    role: Ui.Typography.SansCaption
                                    tone: Ui.Text.Secondary
                                    Layout.fillWidth: true
                                }
                                Repeater {
                                    model: change.modelData.changes || []
                                    Ui.Text {
                                        required property var modelData
                                        text: modelData.key + ": " + JSON.stringify(modelData.oldValue) + " → " + JSON.stringify(modelData.newValue)
                                        role: Ui.Typography.MonoCaption
                                        tone: Ui.Text.Secondary
                                        Layout.fillWidth: true
                                        wrapMode: Text.WrapAnywhere
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ui.Dialog {
        id: deleteConfirmation
        title: "Delete inspected version?"
        width: Math.min(Ui.Metrics.dialogCompactWidth, root.width)
        modal: true
        returnFocusTo: root
        contentItem: RowLayout {
            Ui.EditorButton {
                objectName: "cancel-delete-version"
                text: "Cancel"
                onClicked: deleteConfirmation.close()
            }
            Ui.EditorButton {
                objectName: "confirm-delete-version"
                text: "Delete version"
                variant: Ui.EditorButton.Destructive
                onClicked: {
                    root.controller.deleteSelected()
                    deleteConfirmation.close()
                }
            }
        }
    }
    // The web's timeline history asks for an optional name, then snapshots the server row
    // (web/src/components/timeline/TimelineVersionHistoryPanel.tsx).
    Ui.Dialog {
        id: saveDialog
        title: "Save version"
        width: Math.min(Ui.Metrics.dialogCompactWidth, root.width)
        modal: true
        returnFocusTo: root
        onOpened: {
            versionName.text = ""
            versionName.forceActiveFocus()
        }
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.md
            Ui.Text {
                text: "Name"
                role: Ui.Typography.SansLabel
            }
            Ui.TextField {
                id: versionName
                objectName: "save-version-name"
                Layout.fillWidth: true
                accessibleName: "Version name"
                placeholderText: "Optional"
                onAccepted: saveButton.clicked()
            }
            Ui.Text {
                text: "Saves the workflow as the server holds it, after your unsaved edits are sent."
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                Layout.fillWidth: true
                wrapMode: Text.Wrap
            }
            RowLayout {
                Layout.alignment: Qt.AlignRight
                Ui.EditorButton {
                    objectName: "cancel-save-version"
                    text: "Cancel"
                    onClicked: saveDialog.close()
                }
                Ui.EditorButton {
                    id: saveButton
                    objectName: "confirm-save-version"
                    text: "Save version"
                    variant: Ui.EditorButton.Primary
                    onClicked: {
                        const name = versionName.text
                        saveDialog.close()
                        root.controller.createVersion(name)
                    }
                }
            }
        }
    }
}

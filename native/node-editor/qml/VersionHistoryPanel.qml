pragma ComponentBehavior: Bound
import QtQuick
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
                Ui.EditorButton {
                    text: "Close"
                    Layout.minimumWidth: implicitWidth
                    onClicked: root.closeRequested()
                }
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
                Ui.EditorButton {
                    text: "Refresh"
                    Layout.minimumWidth: implicitWidth
                    enabled: root.controller.available && !root.controller.busy
                    onClicked: root.controller.load("versions")
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
            Ui.ScrollArea {
                Layout.fillWidth: true
                Layout.fillHeight: true
                ColumnLayout {
                    width: parent.width
                    Repeater {
                        model: root.controller.rows
                        ColumnLayout {
                            id: entry
                            required property var modelData
                            required property int index
                            Layout.fillWidth: true
                            visible: root.matches(entry.modelData)
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
                            }
                            RowLayout {
                                visible: !root.compareMode && root.controller.selectedIndex === entry.index
                                Ui.EditorButton {
                                    text: "Restore"
                                    enabled: !root.controller.busy
                                    loading: root.controller.busy
                                    onClicked: root.controller.restore(confirmation.checked)
                                }
                                Ui.EditorButton {
                                    text: "Delete"
                                    enabled: !root.controller.busy
                                    onClicked: deleteConfirmation.open()
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
        Ui.ScrollArea {
            id: detailColumn
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumWidth: Math.max(confirmation.implicitWidth, actionRow.implicitWidth)
            ColumnLayout {
                width: parent.width
                spacing: Ui.Metrics.md
                Ui.Text {
                    text: root.controller.selectedIndex < 0 ? "Select a version" : "Inspected version"
                    role: Ui.Typography.SansLabel
                }
                Ui.Text {
                    objectName: "version-detail-time"
                    visible: root.controller.selectedIndex >= 0
                    text: {
                        const row = root.controller.rows[root.controller.selectedIndex]
                        if (!row || !row.created_at) {
                            return "Time unavailable"
                        }
                        return root.controller.absoluteLabel(row.created_at) + " · " + root.controller.relativeLabel(row.created_at, root.controller.clock)
                    }
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
                VersionGraphPreview {
                    objectName: "version-graph-preview"
                    interactive: true
                    // Comparing two versions draws the visual diff in the preview's place, as the web does.
                    graph: root.comparing ? (root.controller.comparison.newGraph || {}) : root.controller.selectedGraph
                    oldGraph: root.comparing ? (root.controller.comparison.oldGraph || {}) : {}
                    diff: root.comparing ? root.controller.comparison : undefined
                    Layout.fillWidth: true
                    Layout.preferredHeight: Ui.Metrics.touch * 3
                }
                Ui.Text {
                    objectName: "versions-error"
                    text: root.controller.error
                    visible: text !== ""
                    role: Ui.Typography.SansBody
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
                Ui.CheckBox {
                    id: confirmation
                    objectName: "restore-confirm"
                    text: "Replace unsaved work"
                    Layout.minimumWidth: implicitWidth
                }
                RowLayout {
                    id: actionRow
                    Ui.EditorButton {
                        objectName: "restore-version"
                        text: "Restore"
                        loading: root.controller.busy
                        enabled: root.controller.selectedIndex >= 0 && root.controller.available && !root.controller.busy
                        onClicked: root.controller.restore(confirmation.checked)
                    }
                    Ui.EditorButton {
                        objectName: "delete-selected-version"
                        text: "Delete"
                        enabled: root.controller.selectedIndex >= 0 && !root.controller.busy
                        onClicked: deleteConfirmation.open()
                    }
                }
                Ui.Text {
                    objectName: "version-diff-heading"
                    text: root.comparing ? "Comparing v" + root.controller.comparison.oldVersion + " ↔ v" + root.controller.comparison.newVersion : "Current document → inspected version"
                    role: Ui.Typography.SansLabel
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                }
                Ui.Text {
                    visible: !root.controller.comparison.hasChanges
                    text: "No changes detected"
                    role: Ui.Typography.SansCaption
                }
                Repeater {
                    model: ["addedNodes", "removedNodes", "modifiedNodes", "addedEdges", "removedEdges", "modifiedEdges"]
                    ColumnLayout {
                        id: section
                        required property string modelData
                        Layout.fillWidth: true
                        visible: (root.controller.comparison[modelData] || []).length > 0
                        Ui.Text {
                            tone: section.modelData.startsWith("added") ? Ui.Text.Success : section.modelData.startsWith("removed") ? Ui.Text.Error : Ui.Text.Warning
                            text: ({addedNodes: "Added nodes", removedNodes: "Removed nodes", modifiedNodes: "Changed nodes", addedEdges: "Added connections", removedEdges: "Removed connections", modifiedEdges: "Changed connections"})[section.modelData] + " (" + (root.controller.comparison[section.modelData] || []).length + ")"
                            role: Ui.Typography.SansLabel
                        }
                        Repeater {
                            model: root.controller.comparison[section.modelData] || []
                            ColumnLayout {
                                id: change
                                required property var modelData
                                Layout.fillWidth: true
                                Ui.Text {
                                    text: change.modelData.type || change.modelData.id || (change.modelData.source + " → " + change.modelData.target)
                                    role: Ui.Typography.SansCaption
                                    Layout.fillWidth: true
                                    wrapMode: Text.WrapAnywhere
                                }
                                Repeater {
                                    model: change.modelData.changes || []
                                    Ui.Text {
                                        required property var modelData
                                        text: modelData.key + ": " + JSON.stringify(modelData.oldValue) + " → " + JSON.stringify(modelData.newValue)
                                        role: Ui.Typography.MonoCaption
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

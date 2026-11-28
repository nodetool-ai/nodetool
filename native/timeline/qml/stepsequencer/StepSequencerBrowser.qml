// The Pattern Browser (SQ43): search, Save Pattern and Save Template, then the
// Patterns and Templates sections with factory and user entries. Choosing an
// entry replaces the open pattern through apply_step_pattern, one undo entry.
// User entries are files of the user library (SQ44). UI thread only.
pragma ComponentBehavior: Bound
import QtQuick
import "." as Local
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property Local.StepSequencerPanel panel
    color: Ui.Theme.surfacePanel
    clip: true
    property string query: ""
    onQueryChanged: panel.sequencer.setLibraryQuery(query)

    Ui.TextField {
        id: search
        objectName: "stepSequencerBrowserSearch"
        x: Ui.Metrics.md
        y: Ui.Metrics.md
        width: parent.width - Ui.Metrics.md * 2
        density: Ui.EditorButton.Compact
        leadingIcon: "search"
        clearable: true
        accessibleName: qsTr("Search Patterns")
        value: root.query
        onValuePreviewed: next => root.query = next
        onValueCommitted: next => root.query = next
    }
    Row {
        id: actions
        x: Ui.Metrics.md
        y: search.y + search.height + Ui.Metrics.sm
        spacing: Ui.Metrics.xs
        Ui.EditorButton {
            objectName: "stepSequencerBrowserSave"
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            iconName: "saveOutlined"
            text: qsTr("Save Pattern")
            enabled: root.panel.sequencer.valid
            onClicked: root.panel.runAction("savePattern")
        }
        Ui.EditorButton {
            objectName: "stepSequencerBrowserSaveTemplate"
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            text: qsTr("Save Template")
            enabled: root.panel.sequencer.valid
            onClicked: root.panel.runAction("saveTemplate")
        }
    }
    ListView {
        id: list
        objectName: "stepSequencerBrowserList"
        y: actions.y + actions.height + Ui.Metrics.sm
        width: parent.width
        height: parent.height - y
        clip: true
        model: root.panel.sequencer.libraryModel
        reuseItems: true
        boundsBehavior: Flickable.StopAtBounds
        delegate: Item {
            id: entry
            required property string header
            required property string entryId
            required property string name
            required property string kind
            required property string category
            readonly property bool isHeader: header !== ""
            width: ListView.view.width
            height: isHeader ? Ui.Metrics.small + Ui.Metrics.sm : Ui.Metrics.compact
            Ui.Text {
                visible: entry.isHeader
                x: Ui.Metrics.md
                anchors.bottom: parent.bottom
                anchors.bottomMargin: Ui.Metrics.xs
                text: entry.header
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                font.capitalization: Font.AllUppercase
            }
            Ui.EditorButton {
                visible: !entry.isHeader
                objectName: entry.isHeader ? "" : "stepSequencerBrowserEntry-" + entry.entryId
                x: Ui.Metrics.xs
                width: parent.width - Ui.Metrics.xs * 2
                height: parent.height
                variant: Ui.EditorButton.Flat
                density: Ui.EditorButton.Compact
                contentAlignment: Qt.AlignLeft
                iconName: entry.isHeader ? "" : (entry.kind === "template" ? "dataArray" : "queueMusic")
                text: entry.isHeader ? "" : entry.name
                description: entry.isHeader ? "" : entry.category
                enabled: root.panel.editable
                onClicked: root.panel.op("apply_step_pattern", {pattern: entry.entryId})
            }
        }
    }
    Rectangle { anchors.right: parent.right; width: Ui.Metrics.border; height: parent.height; color: Ui.Theme.borderSubtle }
}

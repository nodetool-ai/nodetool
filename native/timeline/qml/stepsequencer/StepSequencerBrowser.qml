// The Pattern Browser (SQ43): search, then the Patterns and Templates sections.
// Choosing an entry replaces the open pattern through apply_step_pattern, one
// undo entry. Factory entries only: user patterns live in the asset library,
// which the native app does not list yet. UI thread only.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property var panel
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
    ListView {
        id: list
        objectName: "stepSequencerBrowserList"
        y: search.y + search.height + Ui.Metrics.sm
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

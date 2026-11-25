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
    readonly property var entries: {
        const q = query.trim().toLowerCase()
        const all = panel.sequencer.library.filter(e => !q || (e.name + " " + e.category + " " + e.tags.join(" ")).toLowerCase().indexOf(q) >= 0)
        const out = []
        for (const kind of ["pattern", "template"]) {
            const list = all.filter(e => e.kind === kind)
            if (!list.length) continue
            out.push({header: kind === "pattern" ? qsTr("Patterns") : qsTr("Templates")})
            for (const e of list) out.push(e)
        }
        return out
    }

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
        model: root.entries
        boundsBehavior: Flickable.StopAtBounds
        delegate: Item {
            id: entry
            required property var modelData
            required property int index
            readonly property bool isHeader: modelData.header !== undefined
            width: ListView.view.width
            height: isHeader ? Ui.Metrics.small + Ui.Metrics.sm : Ui.Metrics.compact
            Ui.Text {
                visible: entry.isHeader
                x: Ui.Metrics.md
                anchors.bottom: parent.bottom
                anchors.bottomMargin: Ui.Metrics.xs
                text: entry.isHeader ? entry.modelData.header : ""
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                font.capitalization: Font.AllUppercase
            }
            Ui.EditorButton {
                visible: !entry.isHeader
                objectName: entry.isHeader ? "" : "stepSequencerBrowserEntry-" + entry.modelData.id
                x: Ui.Metrics.xs
                width: parent.width - Ui.Metrics.xs * 2
                height: parent.height
                variant: Ui.EditorButton.Flat
                density: Ui.EditorButton.Compact
                contentAlignment: Qt.AlignLeft
                iconName: entry.isHeader ? "" : (entry.modelData.kind === "template" ? "dataArray" : "queueMusic")
                text: entry.isHeader ? "" : entry.modelData.name
                description: entry.isHeader ? "" : entry.modelData.category
                enabled: root.panel.editable
                onClicked: root.panel.op("apply_step_pattern", {pattern: entry.modelData.id})
            }
        }
    }
    Rectangle { anchors.right: parent.right; width: Ui.Metrics.border; height: parent.height; color: Ui.Theme.borderSubtle }
}

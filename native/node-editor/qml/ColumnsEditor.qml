pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "DataTable.js" as Table

// ColumnsManager.tsx: a Name and Data type header, then one row per column
// with its name, its type and a delete button. A name another column holds is
// refused, as the web ignores it.
ColumnLayout {
    id: root
    objectName: "columns-editor"
    required property var columns
    required property bool writable
    signal editStarted()
    signal columnsCommitted(var columns)
    // Deletes go here instead of columnsCommitted, so a dataframe drops the same
    // position from every row in one write.
    signal columnDeleted(int index)
    property string error: ""
    readonly property var list: Table.asList(columns)
    spacing: Ui.Metrics.xs

    function rename(index, name) {
        const next = Table.renameColumn(list, index, name)
        if (next === null) { error = name === "" ? "Enter a column name" : "Another column has this name"; return false }
        error = ""
        if (name === list[index].name) return true
        editStarted(); columnsCommitted(next); return true
    }
    function setType(index, type) {
        const next = Table.setColumnType(list, index, type)
        if (next === null || type === list[index].data_type) return
        editStarted(); columnsCommitted(next)
    }
    function remove(index) { editStarted(); columnDeleted(index) }

    RowLayout {
        visible: root.list.length > 0
        Layout.fillWidth: true
        spacing: Ui.Metrics.md
        Ui.Text { text: "Name"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; Layout.fillWidth: true }
        Ui.Text { text: "Data type"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; Layout.preferredWidth: Ui.Metrics.touch * 2 + Ui.Metrics.compact + Ui.Metrics.md }
    }
    Repeater {
        model: root.list.length
        delegate: RowLayout {
            id: column
            required property int index
            readonly property var entry: root.list[index] || ({})
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Ui.TextField {
                objectName: "column-name-" + column.index
                Layout.fillWidth: true
                value: String(column.entry.name || "")
                accessibleName: "Column name"
                enabled: root.writable
                onEditStarted: root.editStarted()
                onValueCommitted: value => root.rename(column.index, value)
            }
            Ui.Select {
                objectName: "column-type-" + column.index
                Layout.preferredWidth: Ui.Metrics.touch * 2
                options: Table.COLUMN_TYPES.map(t => ({label: t, value: t}))
                value: column.entry.data_type || "string"
                accessibleName: "Column type"
                enabled: root.writable
                onValueCommitted: value => root.setType(column.index, value)
            }
            NodeButton {
                objectName: "column-delete-" + column.index
                variant: NodeButton.Flat
                iconName: "close"
                accessibleName: "Delete column"
                enabled: root.writable
                onClicked: root.remove(column.index)
            }
        }
    }
    Ui.Text { visible: root.error !== ""; text: root.error; tone: Ui.Text.Error; role: Ui.Typography.SansCaption; Layout.fillWidth: true; wrapMode: Text.Wrap }
}

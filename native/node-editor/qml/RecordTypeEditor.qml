import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "DataTable.js" as Table

// RecordTypeProperty.tsx: an Add column button over ColumnsManager. Fields the
// editor does not know, on the record and on each column, are kept.
ColumnLayout {
    id: root
    objectName: "record-type-editor"
    required property var descriptor
    required property var value
    required property bool writable
    signal editStarted()
    signal valueCommitted(var value)
    readonly property var plainValue: Table.plain(value)
    readonly property bool shapeValid: plainValue === null || plainValue === undefined || (Table.isRecord(plainValue) && (plainValue.columns === undefined || Array.isArray(plainValue.columns)))
    readonly property var record: Table.isRecord(plainValue) ? plainValue : ({type: "record_type", columns: [], data: []})
    readonly property var columns: Array.isArray(record.columns) ? record.columns : []
    spacing: Ui.Metrics.xs
    function publish(nextColumns) {
        if (!writable || !shapeValid) return
        const next = Table.clone(record)
        next.type = "record_type"
        next.columns = nextColumns
        editStarted(); valueCommitted(next)
    }
    function addColumn() { publish(Table.addColumn(columns)) }
    NodeButton {
        objectName: "record-add-column"
        text: "Add column"
        iconName: "add"
        enabled: root.writable && root.shapeValid
        onClicked: root.addColumn()
    }
    ColumnsEditor {
        id: columnsEditor
        Layout.fillWidth: true
        columns: root.columns
        writable: root.writable && root.shapeValid
        onEditStarted: root.editStarted()
        onColumnsCommitted: next => root.publish(next)
        onColumnDeleted: index => root.publish(root.columns.filter((_, i) => i !== index))
    }
    Ui.Text {
        visible: !root.shapeValid
        text: "Stored value has an unexpected shape and is preserved."
        tone: Ui.Text.Disabled
        role: Ui.Typography.SansCaption
        Layout.fillWidth: true
        wrapMode: Text.Wrap
    }
}

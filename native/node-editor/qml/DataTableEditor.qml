pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "DataTable.js" as Table

// The web's table editors for a Constant List (ListProperty.tsx and
// ListTable.tsx), a Constant Dict (DictProperty.tsx and DictTable.tsx) and a
// dataframe (DataframeProperty.tsx, ColumnsManager.tsx and DataTable.tsx), with
// the TableActions.tsx toolbar. A header click sorts the view, as Tabulator's
// does, and leaves the stored order alone. Expand adds the actions of the web's
// dataframe editor dialog: duplicate rows, paste rows and copy as CSV.
ColumnLayout {
    id: root
    objectName: "data-table"
    required property var descriptor
    required property var value
    required property bool writable
    signal editStarted()
    signal valueCommitted(var value)
    readonly property string kind: descriptor.kind === "dataframe" ? "dataframe" : descriptor.kind === "dict" ? "dict" : "list"
    property var working: kind === "list" ? [] : ({})
    // The list and dictionary value type is a view setting, as in the web: it
    // picks the cell editor and is not stored.
    property string valueType: "string"
    property var selected: []
    property bool showSelect: kind !== "dict"
    property bool showRowNumbers: kind !== "dict"
    property bool expanded: false
    property int sortColumn: -1
    property bool ascending: true
    property string status: ""
    property string error: ""
    readonly property var columns: kind === "dataframe" ? Table.frameColumns(working) : kind === "dict" ? [{name: "Key", data_type: "string"}, {name: "Value", data_type: valueType}] : [{name: "Value", data_type: valueType}]
    readonly property int rowCount: kind === "list" ? working.length : kind === "dict" ? Object.keys(working).length : Table.frameRows(working).length
    readonly property var keys: kind === "dict" ? Object.keys(working) : []
    // The dialog's search: rows with a cell that contains the text, ignoring case.
    property string filterText: ""
    readonly property var order: {
        let indices = []
        for (let i = 0; i < rowCount; ++i) indices.push(i)
        if (sortColumn >= 0 && sortColumn < columns.length) indices = Table.sortedOrder(indices.map(i => cell(i, sortColumn)), ascending)
        const needle = filterText.trim().toLowerCase()
        if (needle === "") return indices
        return indices.filter(row => columns.some((_, column) => display(row, column).toLowerCase().indexOf(needle) >= 0))
    }
    readonly property real rowHeight: Ui.Metrics.compact
    readonly property real columnWidth: Ui.Metrics.touch * 2
    readonly property real utilityWidth: (showSelect ? Ui.Metrics.compact : 0) + (showRowNumbers ? Ui.Metrics.touch : 0)
    spacing: Ui.Metrics.xs

    function normalized(input) {
        const v = Table.plain(input)
        if (kind === "list") return Array.isArray(v) ? v : []
        if (kind === "dict") return Table.isRecord(v) ? v : {}
        const frame = Table.isRecord(v) ? v : {}
        frame.type = "dataframe"
        if (!Array.isArray(frame.columns)) frame.columns = []
        if (!Array.isArray(frame.data)) frame.data = []
        return frame
    }
    function sync() {
        working = normalized(value)
        selected = selected.filter(i => i < rowCount)
    }
    Component.onCompleted: { sync(); valueType = Table.detectType(working) }
    onValueChanged: sync()
    onWritableChanged: if (!writable) sync()

    function publish(next) {
        if (!writable) return false
        error = ""
        editStarted(); working = next; valueCommitted(next)
        return true
    }
    function cell(row, column) {
        if (kind === "list") return working[row]
        if (kind === "dict") return column === 0 ? keys[row] : working[keys[row]]
        const data = Table.frameRows(working)[row]
        return Array.isArray(data) ? data[column] : undefined
    }
    function cellType(column) { return (columns[column] || {}).data_type || "string" }
    function display(row, column) {
        const v = cell(row, column)
        if (kind === "dict" && column === 0) return String(v)
        const type = cellType(column)
        if (v === null || v === undefined) return ""
        if (typeof v === "object") return JSON.stringify(v)
        return String(type === "int" || type === "float" ? Table.coerce(v, type) : v)
    }
    function isSelected(row) { return selected.indexOf(row) >= 0 }
    function toggleRow(row, on) {
        const next = selected.filter(i => i !== row)
        if (on) next.push(row)
        selected = next
    }
    function selectAll(on) {
        const next = []
        if (on) for (let i = 0; i < rowCount; ++i) next.push(i)
        selected = next
    }
    function sortBy(column) {
        if (sortColumn === column) ascending = !ascending
        else { sortColumn = column; ascending = true }
    }
    function resetSorting() { sortColumn = -1; ascending = true }

    function addRow() {
        status = ""
        if (kind === "list") return publish(working.length === 0 ? [Table.defaultValue(valueType)] : Table.listAdd(working))
        if (kind === "dict") return publish(Table.dictAdd(working))
        return publish(Table.frameAddRow(working))
    }
    function deleteSelected() {
        if (selected.length === 0) return false
        status = ""
        const rows = selected.slice()
        const next = kind === "list" ? Table.removeIndices(working, rows)
            : kind === "dict" ? Table.dictRemove(working, rows.map(i => keys[i]))
            : Table.withRows(working, Table.removeIndices(Table.frameRows(working), rows))
        if (!publish(next)) return false
        selected = []
        return true
    }
    function duplicateSelected() {
        if (kind === "dict" || selected.length === 0) return false
        const rows = selected.slice()
        const next = kind === "list" ? Table.duplicateIndices(working, rows) : Table.withRows(working, Table.duplicateIndices(Table.frameRows(working), rows))
        if (!publish(next)) return false
        status = rows.length === 1 ? "Duplicated 1 row" : "Duplicated " + rows.length + " rows"
        return true
    }
    // Writes a typed cell. The key column of a dictionary renames its entry.
    function setCell(row, column, text) {
        status = ""
        const type = cellType(column)
        if (kind === "dict" && column === 0) {
            const next = Table.dictRename(working, keys[row], text)
            if (next === null) { error = text === "" ? "Enter a key" : "Another entry has this key"; return false }
            return text === keys[row] ? true : publish(next)
        }
        if (type === "int" && !Number.isInteger(Number(text))) { error = "Enter a whole number"; return false }
        if (type === "float" && !Number.isFinite(Number(text))) { error = "Enter a number"; return false }
        if (type === "datetime" && text !== "" && isNaN(Date.parse(text))) { error = "Enter a date and time"; return false }
        // DataTableEditors.datetimeEditor stores the parsed date as ISO 8601.
        const typed = type === "datetime" && text !== "" ? new Date(text).toISOString() : Table.coerce(text, type)
        if (kind === "list") return publish(Table.setAt(working, row, typed))
        if (kind === "dict") return publish(Table.dictSet(working, keys[row], typed))
        return publish(Table.frameSetCell(working, row, column, typed))
    }
    function moveRow(row, offset) {
        if (kind === "dict" || sortColumn >= 0) return false
        const next = kind === "list" ? Table.moveIndex(working, row, offset) : (() => { const rows = Table.moveIndex(Table.frameRows(working), row, offset); return rows === null ? null : Table.withRows(working, rows) })()
        return next !== null && publish(next)
    }
    function copyJson() {
        clipboard.write(Table.toJson(kind, working))
        status = "Copied to clipboard"
    }
    function copyCsv() {
        clipboard.write(Table.toCsv(working))
        status = "Copied as CSV"
    }
    function pasteText(text) {
        if (!text || !text.trim()) { error = "Clipboard is empty"; return false }
        const result = Table.framePaste(working, text, selected)
        if (result === null) { error = "No rows to paste"; return false }
        if (!publish(result.frame)) return false
        status = result.count === 1 ? "Pasted 1 row" : "Pasted " + result.count + " rows"
        return true
    }
    function paste() { return pasteText(clipboard.read()) }
    // The dataframe's ColumnsManager and Add column button.
    function addColumn() { return publish(Object.assign(Table.clone(working), {columns: Table.addColumn(Table.frameColumns(working))})) }
    function setColumns(next) { return publish(Object.assign(Table.clone(working), {columns: next})) }
    function removeColumn(index) {
        if (sortColumn === index) resetSorting()
        return publish(Table.frameRemoveColumn(working, index))
    }

    // QML has no clipboard API; a hidden text edit carries the text.
    TextEdit {
        id: clipboard
        visible: false
        function write(text) { clipboard.text = text; clipboard.selectAll(); clipboard.copy(); clipboard.text = "" }
        function read() { clipboard.text = ""; clipboard.paste(); const text = clipboard.text; clipboard.text = ""; return text }
    }

    RowLayout {
        visible: root.kind !== "dataframe"
        Layout.fillWidth: true
        spacing: Ui.Metrics.md
        Ui.Text { text: "Data type"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        Ui.Select {
            objectName: "data-table-type"
            Layout.fillWidth: true
            options: Table.VALUE_TYPES.map(t => ({label: t, value: t}))
            value: root.valueType
            accessibleName: "Data type"
            onValueCommitted: value => root.valueType = value
        }
    }
    Ui.EditorButton {
        variant: Ui.EditorButton.Outlined
        visible: root.kind === "dataframe"
        objectName: "data-table-add-column"
        text: "Add column"
        iconName: "add"
        enabled: root.writable
        onClicked: root.addColumn()
    }
    ColumnsEditor {
        visible: root.kind === "dataframe" && root.columns.length > 0
        Layout.fillWidth: true
        columns: root.columns
        writable: root.writable
        onEditStarted: root.editStarted()
        onColumnsCommitted: next => root.setColumns(next)
        onColumnDeleted: index => root.removeColumn(index)
    }
    Flow {
        objectName: "data-table-actions"
        visible: root.kind !== "dataframe" || root.columns.length > 0
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        Ui.EditorButton { objectName: "data-table-add-row"; variant: Ui.EditorButton.Outlined; flat: true; iconName: "add"; text: "Add row"; visible: root.writable; onClicked: root.addRow() }
        Ui.EditorButton { objectName: "data-table-delete"; variant: Ui.EditorButton.Outlined; flat: true; iconName: "deleteOutline"; accessibleName: "Delete selected rows"; visible: root.writable; enabled: root.selected.length > 0; onClicked: root.deleteSelected() }
        Ui.EditorButton { objectName: "data-table-duplicate"; variant: Ui.EditorButton.Outlined; flat: true; iconName: "duplicate"; accessibleName: "Duplicate selected rows"; visible: root.writable && root.expanded && root.kind !== "dict"; enabled: root.selected.length > 0; onClicked: root.duplicateSelected() }
        Ui.EditorButton { objectName: "data-table-reset-sort"; variant: Ui.EditorButton.Outlined; flat: true; iconName: "reset"; accessibleName: "Reset sorting"; enabled: root.sortColumn >= 0; onClicked: root.resetSorting() }
        Ui.EditorButton { objectName: "data-table-paste"; variant: Ui.EditorButton.Outlined; flat: true; text: "Paste"; accessibleName: "Paste rows from clipboard"; visible: root.writable && root.expanded && root.kind === "dataframe"; onClicked: root.paste() }
        Ui.EditorButton { objectName: "data-table-copy-csv"; variant: Ui.EditorButton.Outlined; flat: true; text: "CSV"; accessibleName: "Copy as CSV"; visible: root.expanded && root.kind === "dataframe"; onClicked: root.copyCsv() }
        Ui.EditorButton { objectName: "data-table-select-column"; variant: Ui.EditorButton.Outlined; flat: !root.showSelect; iconName: "check"; accessibleName: "Show select column"; onClicked: root.showSelect = !root.showSelect }
        Ui.EditorButton { objectName: "data-table-row-numbers"; variant: Ui.EditorButton.Outlined; flat: !root.showRowNumbers; text: "#"; accessibleName: "Show row numbers"; visible: root.kind === "dataframe"; onClicked: root.showRowNumbers = !root.showRowNumbers }
        Ui.EditorButton { objectName: "data-table-copy"; variant: Ui.EditorButton.Outlined; flat: true; iconName: "copy"; accessibleName: "Copy table data as JSON"; onClicked: root.copyJson() }
        Ui.EditorButton { objectName: "data-table-expand"; variant: Ui.EditorButton.Outlined; flat: true; iconName: root.expanded ? "fullscreenExit" : "fullscreen"; accessibleName: root.expanded ? "Collapse table" : "Expand table"; visible: root.kind === "dataframe"; onClicked: { root.expanded = !root.expanded; if (!root.expanded) root.filterText = "" } }
    }
    Ui.TextField {
        objectName: "data-table-search"
        visible: root.expanded
        Layout.fillWidth: true
        value: root.filterText
        placeholderText: "Search table"
        accessibleName: "Search table"
        onValuePreviewed: value => root.filterText = value
        onValueCommitted: value => root.filterText = value
    }
    Flickable {
        id: grid
        objectName: "data-table-grid"
        visible: root.kind !== "dataframe" || root.columns.length > 0
        Layout.fillWidth: true
        readonly property int visibleRows: Math.max(1, Math.min(root.rowCount, root.expanded ? 16 : 6))
        Layout.preferredHeight: root.rowHeight * (visibleRows + 1)
        clip: true
        contentWidth: Math.max(width, root.utilityWidth + root.columns.length * root.columnWidth)
        contentHeight: height
        flickableDirection: Flickable.HorizontalFlick
        boundsBehavior: Flickable.StopAtBounds
        readonly property real dataWidth: (contentWidth - root.utilityWidth) / Math.max(1, root.columns.length)
        Rectangle {
            id: header
            width: grid.contentWidth
            height: root.rowHeight
            color: Ui.Theme.surfacePanel
            Row {
                anchors.fill: parent
                Item {
                    visible: root.showSelect
                    width: Ui.Metrics.compact; height: parent.height
                    Ui.CheckBox {
                        anchors.centerIn: parent
                        objectName: "data-table-select-all"
                        accessibleName: "Select all rows"
                        checked: root.rowCount > 0 && root.selected.length === root.rowCount
                        onCheckedChangedByUser: checked => root.selectAll(checked)
                    }
                }
                Ui.Text { visible: root.showRowNumbers; width: Ui.Metrics.touch; height: parent.height; leftPadding: Ui.Metrics.xs; verticalAlignment: Text.AlignVCenter; text: root.kind === "list" ? "Index" : ""; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Repeater {
                    model: root.columns.length
                    delegate: Item {
                        id: heading
                        required property int index
                        width: grid.dataWidth; height: parent.height
                        Ui.Text {
                            anchors.fill: parent
                            leftPadding: Ui.Metrics.xs
                            verticalAlignment: Text.AlignVCenter
                            elide: Text.ElideRight
                            text: String((root.columns[heading.index] || {}).name) + (root.sortColumn === heading.index ? (root.ascending ? " ▲" : " ▼") : "")
                            role: Ui.Typography.SansCaption
                            font.weight: Font.Medium
                        }
                        MouseArea {
                            objectName: "data-table-sort-" + heading.index
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.sortBy(heading.index)
                        }
                    }
                }
            }
        }
        ListView {
            id: rows
            objectName: "data-table-rows"
            y: header.height
            width: grid.contentWidth
            height: grid.height - header.height
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            model: root.order.length
            delegate: Rectangle {
                id: line
                required property int index
                readonly property int row: root.order[index]
                width: rows.width
                height: root.rowHeight
                color: root.isSelected(row) ? Ui.Theme.actionSelected : "transparent"
                Row {
                    anchors.fill: parent
                    Item {
                        visible: root.showSelect
                        width: Ui.Metrics.compact; height: parent.height
                        Ui.CheckBox {
                            anchors.centerIn: parent
                            objectName: "data-table-select-" + line.row
                            accessibleName: "Select row " + (line.row + 1)
                            checked: root.isSelected(line.row)
                            onCheckedChangedByUser: checked => root.toggleRow(line.row, checked)
                        }
                    }
                    Ui.Text { visible: root.showRowNumbers; width: Ui.Metrics.touch; height: parent.height; leftPadding: Ui.Metrics.xs; verticalAlignment: Text.AlignVCenter; text: String(line.row + 1); role: Ui.Typography.MonoCaption; tone: Ui.Text.Secondary }
                    Repeater {
                        model: root.columns.length
                        delegate: Ui.TextField {
                            id: field
                            required property int index
                            objectName: "data-table-cell-" + line.row + "-" + index
                            width: grid.dataWidth
                            height: root.rowHeight
                            density: Ui.EditorButton.Compact
                            value: root.display(line.row, index)
                            accessibleName: String((root.columns[index] || {}).name) + " in row " + (line.row + 1)
                            enabled: root.writable
                            onEditStarted: root.editStarted()
                            onValueCommitted: value => root.setCell(line.row, field.index, value)
                            // Tabulator moves rows by dragging; here Alt+Up and Alt+Down move the stored row.
                            Keys.onPressed: event => {
                                if (!(event.modifiers & Qt.AltModifier) || (event.key !== Qt.Key_Up && event.key !== Qt.Key_Down)) return
                                event.accepted = root.moveRow(line.row, event.key === Qt.Key_Up ? -1 : 1)
                            }
                        }
                    }
                }
            }
        }
    }
    Ui.Text { visible: root.kind === "dataframe" && root.columns.length === 0; text: "Add a column to start the table."; tone: Ui.Text.Disabled; role: Ui.Typography.SansCaption }
    Ui.Text { objectName: "data-table-status"; visible: root.status !== "" && root.error === ""; text: root.status; tone: Ui.Text.Success; role: Ui.Typography.SansCaption; Layout.fillWidth: true }
    Ui.Text { objectName: "data-table-error"; visible: root.error !== ""; text: root.error; tone: Ui.Text.Error; role: Ui.Typography.SansCaption; Layout.fillWidth: true; wrapMode: Text.Wrap }
}

.pragma library
// Table edits for DataTableEditor.qml and ColumnsEditor.qml. Each function
// returns a new value and leaves its input untouched. The rules follow
// web/src/components/node/DataTable/ (ListTable, DictTable, DataTable,
// TableActions) and ColumnsManager.tsx.

var VALUE_TYPES = ["int", "string", "datetime", "float"]
var COLUMN_TYPES = ["string", "float", "int", "datetime"]

function clone(value) { return JSON.parse(JSON.stringify(value)) }

// A QVariantList from C++ is not a JS array until it is copied.
function plain(value) { return value === null || value === undefined ? value : clone(value) }
function asList(value) { var copy = plain(value); return Array.isArray(copy) ? copy : [] }

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value) }

// ListProperty.tsx and DictProperty.tsx read the type from the first value.
function detectType(values) {
    var first = Array.isArray(values) ? values[0] : isRecord(values) ? values[Object.keys(values)[0]] : undefined
    if (typeof first === "number") return Number.isInteger(first) ? "int" : "float"
    return "string"
}

function coerce(value, type) {
    if (type === "int") { var i = parseInt(String(value)); return isNaN(i) ? 0 : i }
    if (type === "float") { var f = parseFloat(String(value)); return isNaN(f) ? 0 : f }
    if (value === null || value === undefined) return ""
    return type === "string" || type === "datetime" ? String(value) : value
}

function defaultValue(type) { return type === "int" || type === "float" ? 0 : "" }

// TableActions.handleAddRow: a list matches its first value's type.
function listAdd(list) {
    var next = clone(list)
    next.push(next.length > 0 && typeof next[0] === "number" ? 0 : "")
    return next
}

function setAt(list, index, value) { var next = clone(list); next[index] = value; return next }

function removeIndices(list, indices) {
    var drop = {}
    for (var i = 0; i < indices.length; ++i) drop[indices[i]] = true
    return list.filter(function (_, index) { return !drop[index] })
}

// TableActions.handleDuplicateRows: copies go after the last selected row, in selection order.
function duplicateIndices(list, indices) {
    if (indices.length === 0) return clone(list)
    var copies = indices.map(function (index) { return clone(list[index]) })
    var next = clone(list)
    var last = Math.max.apply(null, indices)
    Array.prototype.splice.apply(next, [last + 1, 0].concat(copies))
    return next
}

function moveIndex(list, index, offset) {
    var destination = index + offset
    if (destination < 0 || destination >= list.length) return null
    var next = clone(list)
    var item = next.splice(index, 1)[0]
    next.splice(destination, 0, item)
    return next
}

// TableActions names a new dictionary key new_key_<count>. A taken name moves to the next free count.
function dictAdd(dict) {
    var next = clone(dict)
    var n = Object.keys(next).length
    while (Object.prototype.hasOwnProperty.call(next, "new_key_" + n)) ++n
    next["new_key_" + n] = ""
    return next
}

// DictTable.onCellEdited keeps the key order and refuses a rename onto another key.
function dictRename(dict, oldKey, newKey) {
    if (newKey === oldKey) return clone(dict)
    if (newKey === "" || Object.prototype.hasOwnProperty.call(dict, newKey)) return null
    var next = {}
    Object.keys(dict).forEach(function (key) { next[key === oldKey ? newKey : key] = clone(dict[key]) })
    return next
}

function dictSet(dict, key, value) { var next = clone(dict); next[key] = value; return next }

function dictRemove(dict, keys) {
    var next = clone(dict)
    keys.forEach(function (key) { delete next[key] })
    return next
}

function frameColumns(frame) { return isRecord(frame) && Array.isArray(frame.columns) ? frame.columns : [] }
function frameRows(frame) { return isRecord(frame) && Array.isArray(frame.data) ? frame.data : [] }

function withRows(frame, rows) { var next = clone(frame); next.data = rows; return next }

function frameAddRow(frame) {
    var row = frameColumns(frame).map(function (column) { return defaultValue(column.data_type) })
    return withRows(frame, clone(frameRows(frame)).concat([row]))
}

function frameSetCell(frame, rowIndex, columnIndex, value) {
    var rows = clone(frameRows(frame))
    var column = frameColumns(frame)[columnIndex] || {}
    var row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : []
    row[columnIndex] = coerce(value, column.data_type)
    rows[rowIndex] = row
    return withRows(frame, rows)
}

// DataframeProperty.addColumn: the first free "Column <n>", a string column.
function addColumn(columns) {
    var names = {}
    columns.forEach(function (column) { names[column.name] = true })
    var n = 1
    while (names["Column " + n]) ++n
    return clone(columns).concat([{name: "Column " + n, data_type: "string", description: ""}])
}

// ColumnsManager.handleNameChange ignores a name another column holds.
function renameColumn(columns, index, name) {
    if (name === "" || columns.some(function (column, i) { return i !== index && column.name === name })) return null
    var next = clone(columns)
    next[index].name = name
    return next
}

function setColumnType(columns, index, type) {
    if (COLUMN_TYPES.indexOf(type) < 0) return null
    var next = clone(columns)
    next[index].data_type = type
    return next
}

// csvDataframe.removeDataframeColumn drops the same position from every row.
function frameRemoveColumn(frame, index) {
    var next = clone(frame)
    next.columns = frameColumns(frame).filter(function (_, i) { return i !== index })
    if (Array.isArray(next.data)) next.data = next.data.map(function (row) { return Array.isArray(row) ? row.filter(function (_, i) { return i !== index }) : row })
    return next
}

// TableActions.handleCopyData: a list or dictionary as stored, a frame as one object per row.
function toJson(kind, value) {
    if (kind !== "dataframe") return JSON.stringify(value)
    var columns = frameColumns(value)
    return JSON.stringify(frameRows(value).map(function (row) {
        var record = {}
        columns.forEach(function (column, i) { record[column.name] = Array.isArray(row) ? row[i] : undefined })
        return record
    }))
}

// TableActions.handleExportCSV: every value quoted, quotes doubled, no utility columns.
function toCsv(frame) {
    var quote = function (value) { return '"' + String(value === null || value === undefined ? "" : value).replace(/"/g, '""') + '"' }
    var columns = frameColumns(frame)
    var lines = [columns.map(function (column) { return quote(column.name) }).join(",")]
    frameRows(frame).forEach(function (row) { lines.push(columns.map(function (_, i) { return quote(Array.isArray(row) ? row[i] : "") }).join(",")) })
    return lines.join("\n")
}

// TableActions.parseCSVLine: comma or tab separated, double quotes escape.
function parseCsvLine(line) {
    var result = [], current = "", quoted = false
    for (var i = 0; i < line.length; ++i) {
        var c = line[i]
        if (c === '"') {
            if (quoted && line[i + 1] === '"') { current += '"'; ++i }
            else quoted = !quoted
        } else if ((c === "," || c === "\t") && !quoted) { result.push(current.trim()); current = "" }
        else current += c
    }
    result.push(current.trim())
    return result
}

// TableActions.handlePaste: a header row that names columns maps by name, otherwise by
// position after leading empty cells. Rows go after the last selected row, or at the end.
// Returns {frame, count}, or null when the text holds no rows.
function framePaste(frame, text, selected) {
    var columns = frameColumns(frame)
    if (!text || !text.trim() || columns.length === 0) return null
    var rows = text.trim().split(/\r?\n/).map(parseCsvLine)
    var names = columns.map(function (column) { return String(column.name).toLowerCase() })
    var first = rows[0].map(function (cell) { return cell.toLowerCase().replace(/^"|"$/g, "") })
    var matches = first.filter(function (cell) { return names.indexOf(cell) >= 0 }).length
    var header = matches >= Math.min(2, columns.length)
    var source = {}
    if (header) {
        first.forEach(function (cell, pasteIndex) { var i = names.indexOf(cell); if (i >= 0) source[i] = pasteIndex })
    } else {
        var start = 0
        for (var c = 0; c < rows[0].length; ++c) { if (rows[0][c] !== "") { start = c; break } }
        columns.forEach(function (_, i) { source[i] = start + i })
    }
    var body = header ? rows.slice(1) : rows
    if (body.length === 0) return null
    var added = body.map(function (row) {
        return columns.map(function (column, i) {
            var cell = source[i] === undefined ? "" : String(row[source[i]] === undefined ? "" : row[source[i]]).replace(/^"|"$/g, "")
            return column.data_type === "int" || column.data_type === "float" ? coerce(cell, column.data_type) : cell
        })
    })
    var existing = clone(frameRows(frame))
    var at = selected.length > 0 ? Math.max.apply(null, selected) + 1 : existing.length
    Array.prototype.splice.apply(existing, [at, 0].concat(added))
    return {frame: withRows(frame, existing), count: added.length}
}

// The view order of a header sort. Sorting changes only the view, as Tabulator's does.
function sortedOrder(values, ascending) {
    var order = values.map(function (_, i) { return i })
    order.sort(function (a, b) {
        var x = values[a], y = values[b]
        var result = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))
        return (ascending ? result : -result) || a - b
    })
    return order
}

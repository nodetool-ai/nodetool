pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "structured-editor"
    required property var descriptor
    required property var value
    required property bool writable
    signal editStarted()
    signal valueCommitted(var value)
    property string error: ""
    property string jsonDraft: ""
    property var working: null
    readonly property string kind: descriptor.kind
    readonly property bool shapeValid: kind === "list" ? Array.isArray(working)
        : working !== null && typeof working === "object" && !Array.isArray(working)
          && (kind !== "record_type" || Array.isArray(working.columns))
    readonly property var rows: !shapeValid ? [] : kind === "list" ? (Array.isArray(working) ? working : [])
        : kind === "record_type" ? (working && working.columns || []) : Object.keys(working || {})
    readonly property var args: descriptor.dataType && descriptor.dataType.type_args || []
    readonly property var entryType: args.length ? args[args.length - 1] : ({type: "any"})
    spacing: Ui.Metrics.xs
    EditorRoles { id: roles }
    component FieldFrame: Rectangle {
        required property Item control
        color: !control.enabled ? roles.fieldDisabled : control.activeFocus ? roles.fieldFocus : roles.field
        radius: Ui.Metrics.radiusControl
        border.width: control.activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
        border.color: control.valid === false ? Ui.Theme.borderError : control.activeFocus ? Ui.Theme.borderFocus : "transparent"
    }
    function clone(v) { return JSON.parse(JSON.stringify(v)) }
    function sync() {
        working = value === null || value === undefined ? (kind === "list" ? [] : kind === "record_type" ? {type: "record_type", columns: [], data: []} : {}) : clone(value)
        jsonDraft = kind === "json" ? (working.data || "") : ""
        error = ""
    }
    Component.onCompleted: sync()
    onValueChanged: sync()
    onWritableChanged: if (!writable) sync()
    function cancelEdit() { sync() }
    function publish(v) { if (!writable || !shapeValid) return; editStarted(); working = v; valueCommitted(v) }
    function entry(index) { return kind === "list" ? working[index] : kind === "record_type" ? working.columns[index] : working[rows[index]] }
    function scalarType(v) {
        if (entryType.type !== "any") return entryType.type
        return typeof v === "number" ? "float" : typeof v === "boolean" ? "bool" : typeof v === "string" ? "str" : "opaque"
    }
    function initial(t) {
        if (["int", "integer", "float", "number"].includes(t.type)) return 0
        if (["bool", "boolean"].includes(t.type)) return false
        if (t.type === "list") return []
        if (t.type === "dict") return {}
        return ""
    }
    function replace(index, v) {
        const next = clone(working)
        if (kind === "list") next[index] = v
        else next[rows[index]] = v
        publish(next)
    }
    function remove(index) {
        const next = clone(working)
        if (kind === "list") next.splice(index, 1)
        else if (kind === "record_type") next.columns.splice(index, 1)
        else delete next[rows[index]]
        publish(next)
    }
    function move(index, offset) {
        const next = clone(working), list = kind === "record_type" ? next.columns : next
        const destination = index + offset
        if (destination < 0 || destination >= list.length) return
        const item = list.splice(index, 1)[0]; list.splice(destination, 0, item); publish(next)
    }
    function rename(index, name) {
        const next = clone(working)
        if (!name || (name !== rows[index] && Object.prototype.hasOwnProperty.call(next, name))) { error = "Use a unique, nonempty key"; return }
        if (name === rows[index]) return
        Object.defineProperty(next, name, {value: next[rows[index]], enumerable: true, writable: true, configurable: true}); delete next[rows[index]]; error = ""; publish(next)
    }
    function column(index, field, v) {
        const next = clone(working)
        if (field === "name" && (!v || next.columns.some((c, i) => i !== index && c.name === v))) { error = "Use a unique, nonempty column name"; return }
        next.columns[index][field] = v; error = ""; publish(next)
    }
    function add() {
        if (!writable || !shapeValid) return
        const next = clone(working)
        if (kind === "list") next.push(initial(entryType))
        else if (kind === "record_type") {
            let n = 1; while (next.columns.some(c => c.name === "Column " + n)) ++n
            next.columns.push({name: "Column " + n, data_type: "string", description: ""})
        } else {
            let n = 1; while (Object.prototype.hasOwnProperty.call(next, "key" + n)) ++n
            next["key" + n] = initial(entryType)
        }
        publish(next)
    }
    // A nested list or dictionary is edited as JSON. Text that does not parse, or is not the
    // declared container, leaves the document untouched and keeps the draft in place.
    function replaceNested(index, text) {
        let parsed
        try { parsed = JSON.parse(text) }
        catch (e) { error = "Nested value is not valid JSON: " + e.message; return false }
        const wantsList = entryType.type === "list", wantsDict = entryType.type === "dict"
        if ((wantsList && !Array.isArray(parsed)) || (wantsDict && (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)))) {
            error = wantsList ? "Enter a JSON list" : "Enter a JSON object"
            return false
        }
        error = ""
        replace(index, parsed)
        return true
    }
    function applyJson() {
        if (!writable || !shapeValid) return
        try { if (jsonDraft.trim()) JSON.parse(jsonDraft) }
        catch (e) { error = String(e); return }
        error = ""
        const next = clone(working); next.type = "json"; next.data = jsonDraft; publish(next)
    }
    Ui.TextArea {
        objectName: "structured-json"
        visible: root.kind === "json"
        Layout.fillWidth: true
        implicitHeight: Ui.Metrics.touch * 3
        value: root.jsonDraft
        enabled: root.writable && root.shapeValid
        background: FieldFrame { control: parent }
        accessibleName: "JSON"
        onEditStarted: root.editStarted()
        onValuePreviewed: value => root.jsonDraft = value
        onValueCommitted: value => { root.jsonDraft = value; root.applyJson() }
    }
    NodeButton {
        visible: root.kind === "json"
        objectName: "structured-apply-json"
        text: "Apply JSON"
        enabled: root.writable && root.shapeValid
        onClicked: root.applyJson()
    }
    Ui.Text {
        visible: !root.shapeValid
        text: "Stored value has an unexpected shape and is preserved."
        tone: Ui.Text.Disabled
        role: Ui.Typography.SansCaption
        Layout.fillWidth: true
        wrapMode: Text.Wrap
    }
    Repeater {
        model: root.kind === "json" ? 0 : root.rows.length
        delegate: ColumnLayout {
            id: row
            required property int index
            readonly property var entry: root.entry(index)
            readonly property string type: root.scalarType(entry)
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            RowLayout {
                Layout.fillWidth: true
                Ui.TextField {
                    objectName: "structured-key-" + row.index
                    visible: root.kind === "dict"
                    Layout.fillWidth: true
                    value: String(root.rows[row.index])
                    background: FieldFrame { control: parent }
                    accessibleName: "Dictionary key"
                    enabled: root.writable && root.shapeValid
                    onEditStarted: root.editStarted()
                    onValueCommitted: value => root.rename(row.index, value)
                }
                Ui.Text { visible: root.kind === "list"; text: String(row.index + 1); role: Ui.Typography.MonoCaption }
                NodeButton { objectName: "structured-up-" + row.index; text: "↑"; accessibleName: "Move up"; visible: root.kind !== "dict"; enabled: root.writable && row.index > 0; onClicked: root.move(row.index, -1) }
                NodeButton { objectName: "structured-down-" + row.index; text: "↓"; accessibleName: "Move down"; visible: root.kind !== "dict"; enabled: root.writable && row.index + 1 < root.rows.length; onClicked: root.move(row.index, 1) }
                NodeButton { objectName: "structured-remove-" + row.index; text: "Remove"; enabled: root.writable; onClicked: root.remove(row.index) }
            }
            Ui.TextField {
                objectName: "structured-text-" + row.index
                visible: root.kind !== "record_type" && ["str", "string", "any"].includes(row.type)
                Layout.fillWidth: true
                value: typeof row.entry === "string" ? row.entry : ""
                background: FieldFrame { control: parent }
                accessibleName: "Entry text"
                enabled: root.writable && root.shapeValid
                onEditStarted: root.editStarted()
                onValueCommitted: value => root.replace(row.index, value)
            }
            Ui.NumberField {
                objectName: "structured-number-" + row.index
                visible: root.kind !== "record_type" && ["int", "integer", "float", "number"].includes(row.type)
                Layout.fillWidth: true
                value: typeof row.entry === "number" ? row.entry : 0
                valid: !["int", "integer"].includes(row.type) || Number.isInteger(Number(text))
                background: FieldFrame { control: parent }
                accessibleName: "Entry number"
                enabled: root.writable && root.shapeValid
                onEditStarted: root.editStarted()
                onValueCommitted: value => root.replace(row.index, value)
            }
            Ui.CheckBox {
                visible: root.kind !== "record_type" && ["bool", "boolean"].includes(row.type)
                text: "Enabled"
                checked: row.entry === true
                enabled: root.writable && root.shapeValid
                onCheckedChangedByUser: checked => root.replace(row.index, checked)
            }
            Ui.TextArea {
                objectName: "structured-nested-" + row.index
                visible: root.kind !== "record_type" && !["str", "string", "any", "int", "integer", "float", "number", "bool", "boolean"].includes(row.type)
                Layout.fillWidth: true
                implicitHeight: Ui.Metrics.touch * 2
                role: Ui.Typography.MonoCaption
                value: row.entry === undefined ? "" : JSON.stringify(row.entry, null, 2)
                background: FieldFrame { control: parent }
                accessibleName: "Nested JSON"
                enabled: root.writable && root.shapeValid
                onEditStarted: root.editStarted()
                onValueCommitted: value => root.replaceNested(row.index, value)
            }
            Ui.TextField {
                visible: root.kind === "record_type"
                Layout.fillWidth: true
                value: root.kind === "record_type" ? (row.entry || {}).name || "" : ""
                background: FieldFrame { control: parent }
                accessibleName: "Column name"
                enabled: root.writable && root.shapeValid
                onEditStarted: root.editStarted()
                onValueCommitted: value => root.column(row.index, "name", value)
            }
            Ui.Select {
                visible: root.kind === "record_type"
                Layout.fillWidth: true
                options: ["string", "int", "float", "datetime"].map(t => ({label: t, value: t}))
                value: root.kind === "record_type" ? (row.entry || {}).data_type : "string"
                accessibleName: "Column type"
                enabled: root.writable && root.shapeValid
                onValueCommitted: value => root.column(row.index, "data_type", value)
            }
            Ui.TextField {
                visible: root.kind === "record_type"
                Layout.fillWidth: true
                value: root.kind === "record_type" ? (row.entry || {}).description || "" : ""
                background: FieldFrame { control: parent }
                accessibleName: "Column description"
                enabled: root.writable && root.shapeValid
                onEditStarted: root.editStarted()
                onValueCommitted: value => root.column(row.index, "description", value)
            }
        }
    }
    NodeButton {
        objectName: "structured-add"
        visible: root.kind !== "json"
        enabled: root.writable && root.shapeValid
        text: root.kind === "record_type" ? "Add column" : root.kind === "dict" ? "Add entry" : "Add item"
        onClicked: root.add()
    }
    Ui.Text { visible: root.error !== ""; text: root.error; tone: Ui.Text.Error; role: Ui.Typography.SansCaption; Layout.fillWidth: true; wrapMode: Text.Wrap }
}

import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "workflow-editor-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    required property string nodeId
    property var controller: typeof resourcePickerController === "undefined" ? null : resourcePickerController
    property string requestKey: "workflow-property-" + String(root)
    property int generation: 0
    readonly property string listKey: requestKey + "-list-" + generation
    readonly property string verifyKey: requestKey + "-verify-" + generation
    readonly property bool listMode: descriptor.kind === "workflow_list"
    readonly property var selected: listMode ? (value && typeof value.length === "number" && typeof value !== "string" ? Array.from(value) : []) : value && value.id ? [value] : []
    property var resources: []
    readonly property var resourceNames: new Map(resources.map(row => [row.id, row.name]))
    readonly property var selectedIds: new Set(selected.filter(item => item && item.id).map(item => item.id))
    property var statuses: Object.create(null)
    property var verifyQueue: []
    property int verifyIndex: 0
    property bool verifying: false
    property string searchText: ""
    property string nextCursor: ""
    property bool loading: false
    property bool loaded: false
    property string error: ""
    readonly property var matches: resources.filter(row => (row.name + " " + row.id).toLowerCase().includes(searchText.toLowerCase()))
    signal valueCommitted(var value)
    signal scopeInvalidated()
    spacing: Ui.Metrics.xs
    function cancelEdit() {
        if (controller) { controller.cancel(listKey); controller.cancel(verifyKey) }
        ++generation
        statuses = Object.create(null); verifyQueue = []; verifyIndex = 0; verifying = false; searchText = ""; loading = false; error = ""
    }
    function resetScope() {
        cancelEdit(); resources = []; nextCursor = ""; loaded = false
    }
    function verifySelected() {
        if (!controller || !writable) return
        controller.cancel(verifyKey)
        statuses = Object.create(null); verifyQueue = []; verifyIndex = 0; verifying = false
        const ids = []
        const seen = new Set()
        selected.forEach(item => { if (item && item.id && !seen.has(item.id)) { seen.add(item.id); ids.push(item.id) } })
        verifyQueue = ids
        verifyNext()
    }
    function verifyNext() {
        if (controller && writable && !verifying && verifyIndex < verifyQueue.length) {
            verifying = true
            controller.verifyWorkflow(verifyKey, verifyQueue[verifyIndex])
        }
    }
    function browse(more) {
        if (!controller || !writable) return
        if (!more) { resources = []; nextCursor = ""; verifySelected() }
        error = ""; loading = true
        controller.workflows(listKey, more ? nextCursor : "")
    }
    function choose(id) {
        if (!writable || !resources.some(row => row.id === id)) return
        if (listMode) {
            if (selectedIds.has(id)) return
            valueCommitted(selected.concat([{type: "workflow", id: id}]))
        } else {
            valueCommitted(Object.assign({}, value && typeof value === "object" && !Array.isArray(value) ? value : {}, {type: "workflow", id: id}))
        }
    }
    function removeAt(index) {
        if (!writable || !listMode || index < 0 || index >= selected.length) return
        const next = selected.slice(); next.splice(index, 1); valueCommitted(next)
    }
    function moveAt(index, delta) {
        const destination = index + delta
        if (!writable || !listMode || index < 0 || index >= selected.length || destination < 0 || destination >= selected.length) return
        const next = selected.slice(); const entry = next.splice(index, 1)[0]; next.splice(destination, 0, entry); valueCommitted(next)
    }
    function selectedLabel(item) {
        if (!item || typeof item !== "object" || !item.id) return "Invalid workflow reference"
        const name = resourceNames.get(item.id)
        return (name || item.id) + (statuses[item.id] === "missing" ? " · unavailable or deleted" : statuses[item.id] === "error" ? " · could not verify" : "")
    }
    onNodeIdChanged: resetScope()
    onWritableChanged: if (!writable) resetScope(); else verifySelected()
    onValueChanged: verifySelected()
    Component.onCompleted: verifySelected()
    Component.onDestruction: cancelEdit()
    Connections {
        target: root.controller
        function onCleared() { root.resetScope(); root.scopeInvalidated() }
        function onListed(key, rows, next) {
            if (key !== root.listKey || !root.writable) return
            const known = new Set(root.resources.map(row => row.id))
            root.resources = root.resources.concat(rows.filter(row => { if (known.has(row.id)) return false; known.add(row.id); return true }))
            root.nextCursor = next; root.loading = false; root.loaded = true
        }
        function onVerified(key, id, available) {
            if (key !== root.verifyKey || !root.writable || root.verifyQueue[root.verifyIndex] !== id) return
            root.statuses[id] = available ? "ready" : "missing"; root.statusesChanged()
            root.verifying = false; ++root.verifyIndex; Qt.callLater(root.verifyNext)
        }
        function onFailed(key, message) {
            if (key === root.listKey) { root.loading = false; root.error = message }
            if (key === root.verifyKey && root.verifyIndex < root.verifyQueue.length) {
                root.statuses[root.verifyQueue[root.verifyIndex]] = "error"; root.statusesChanged()
                root.verifying = false; ++root.verifyIndex; Qt.callLater(root.verifyNext)
            }
        }
    }
    Repeater {
        model: root.selected
        delegate: RowLayout {
            required property int index
            required property var modelData
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            Ui.Text { Layout.fillWidth: true; text: root.selectedLabel(parent.modelData); role: Ui.Typography.SansCaption; wrapMode: Text.WrapAnywhere }
            NodeButton { text: "Up"; visible: root.listMode; enabled: root.writable && parent.index > 0; onClicked: root.moveAt(parent.index, -1) }
            NodeButton { text: "Down"; visible: root.listMode; enabled: root.writable && parent.index + 1 < root.selected.length; onClicked: root.moveAt(parent.index, 1) }
            NodeButton { text: "Remove"; visible: root.listMode; enabled: root.writable; onClicked: root.removeAt(parent.index) }
        }
    }
    Ui.TextField {
        objectName: "workflow-search-" + root.descriptor.name
        Layout.fillWidth: true
        value: root.searchText
        accessibleName: "Search loaded workflows"
        placeholderText: "Search loaded workflows"
        enabled: root.writable
        onValuePreviewed: value => root.searchText = value
        onValueCommitted: value => root.searchText = value
    }
    Ui.Select {
        objectName: "workflow-select-" + root.descriptor.name
        Layout.fillWidth: true
        accessibleName: root.listMode ? "Add workflow" : "Select workflow"
        enabled: root.writable && root.matches.length > 0
        options: root.matches.map(row => ({label: row.name, value: row.id, enabled: !root.listMode || !root.selectedIds.has(row.id)}))
        value: !root.listMode && root.value ? root.value.id : ""
        onValueCommitted: value => root.choose(value)
    }
    RowLayout {
        spacing: Ui.Metrics.xs
        NodeButton { text: "Browse workflows"; enabled: root.writable && root.controller && !root.loading; onClicked: root.browse(false) }
        NodeButton { text: "Load more"; visible: root.nextCursor !== ""; enabled: root.writable && !root.loading; onClicked: root.browse(true) }
    }
    Ui.Text {
        Layout.fillWidth: true
        text: root.error || (!root.controller ? "Connect to a server to choose a workflow." : root.loading ? "Loading workflows…" : root.loaded && !root.matches.length ? "No matching workflows in loaded pages." : !root.loaded ? "Browse your workflows to choose one." : root.nextCursor ? "Search covers loaded pages. Load more to include older workflows." : "")
        visible: text !== ""
        tone: root.error ? Ui.Text.Error : Ui.Text.Secondary
        role: Ui.Typography.SansCaption
        wrapMode: Text.Wrap
    }
}

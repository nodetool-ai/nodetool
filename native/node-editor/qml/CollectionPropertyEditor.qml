import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "collection-editor-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    required property string nodeId
    property var controller: typeof resourcePickerController === "undefined" ? null : resourcePickerController
    property string requestKey: "collection-property-" + String(root)
    property int generation: 0
    readonly property string key: requestKey + "-" + generation
    property var collections: []
    property string searchText: ""
    property bool loaded: false
    property bool loading: false
    property string error: ""
    readonly property var matches: collections.filter(row => row.name.toLowerCase().includes(searchText.toLowerCase()))
    signal valueCommitted(var value)
    signal scopeInvalidated()
    spacing: Ui.Metrics.xs
    function cancelEdit() {
        if (controller) controller.cancel(key)
        ++generation; searchText = ""; loading = false; error = ""
    }
    function resetScope() {
        cancelEdit(); collections = []; loaded = false
    }
    function refresh() {
        if (!controller || !writable) return
        loading = true; loaded = false; error = ""
        controller.collections(key)
    }
    function choose(name) {
        if (!writable || !collections.some(row => row.name === name)) return
        valueCommitted(Object.assign({}, value && typeof value === "object" && !Array.isArray(value) ? value : {}, {type: "collection", name: name}))
    }
    onNodeIdChanged: resetScope()
    onWritableChanged: if (!writable) resetScope()
    Component.onCompleted: refresh()
    Component.onDestruction: cancelEdit()
    Connections {
        target: root.controller
        function onCleared() { root.resetScope(); root.scopeInvalidated() }
        function onCollectionsListed(key, rows) {
            if (key !== root.key || !root.writable) return
            root.collections = rows; root.loaded = true; root.loading = false
        }
        function onFailed(key, message) { if (key === root.key) { root.loading = false; root.error = message } }
    }
    Ui.Text {
        Layout.fillWidth: true
        text: root.value && root.value.name ? root.value.name + (root.loaded && !root.collections.some(row => row.name === root.value.name) ? " · unavailable or deleted" : "") : "No collection selected"
        role: Ui.Typography.SansCaption
        wrapMode: Text.WrapAnywhere
    }
    Ui.TextField {
        Layout.fillWidth: true
        accessibleName: "Search collections"
        placeholderText: "Search collections"
        value: root.searchText
        enabled: root.writable
        onValuePreviewed: value => root.searchText = value
        onValueCommitted: value => root.searchText = value
    }
    Ui.Select {
        objectName: "collection-select-" + root.descriptor.name
        Layout.fillWidth: true
        accessibleName: "Select collection"
        options: root.matches.map(row => ({label: row.name, value: row.name}))
        value: root.value && root.value.name ? root.value.name : ""
        enabled: root.writable && root.matches.length > 0
        onValueCommitted: value => root.choose(value)
    }
    NodeButton { text: "Refresh collections"; enabled: root.writable && root.controller && !root.loading; onClicked: root.refresh() }
    Ui.Text {
        Layout.fillWidth: true
        text: root.error || (!root.controller ? "Connect to a server to choose a collection." : root.loading ? "Loading collections…" : root.loaded && !root.matches.length ? "No matching collections." : "")
        visible: text !== ""
        role: Ui.Typography.SansCaption
        tone: root.error ? Ui.Text.Error : Ui.Text.Secondary
        wrapMode: Text.Wrap
    }
}

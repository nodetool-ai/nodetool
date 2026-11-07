import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property var descriptor
    required property var value
    required property bool writable
    required property string nodeId
    // A card's own open button stands beside the select, so its overlay hides this one.
    property bool showOpen: true
    property var controller: typeof documentPickerController === "undefined" ? null : documentPickerController
    readonly property string kind: descriptor.dataType.type
    readonly property string selectedId: value && value.id ? value.id : ""
    property string requestKey: "document-property-" + String(root)
    property int generation: 0
    readonly property string key: requestKey + "-" + generation
    property var rows: []
    property bool loaded: false
    property bool loading: false
    property double fetchedAt: 0
    property string error: ""
    readonly property string untitledLabel: kind === "timeline" ? "Untitled video" : "Untitled " + kind
    readonly property string openEditorLabel: "Open in " + kind + " editor"
    readonly property var selected: rows.find(row => row.id === selectedId)
    readonly property string state: error ? "error" : loading ? "loading" : !selectedId ? "empty" : loaded && !selected ? "missing" : "ready"
    signal valueCommitted(var value)
    signal scopeInvalidated()
    spacing: Ui.Metrics.xs
    function cancelEdit() {
        if (controller) { controller.cancel(key) }
        ++generation
        loading = false
    }
    function resetScope() {
        cancelEdit()
        rows = []
        loaded = false
        error = ""
    }
    function refresh() {
        if (loading || (loaded && Date.now() - fetchedAt < 30000)) { return }
        cancelEdit()
        if (!controller || !writable) { return }
        loading = true
        error = ""
        controller.load(key, kind)
    }
    readonly property var popup: select.popup
    function openPicker() { select.popup.open() }
    function choose(id) {
        if (!writable || id === selectedId || !rows.some(row => row.id === id)) { return }
        const reference = {type: kind, id: id}
        if (kind === "storyboard") { reference.data = null }
        valueCommitted(reference)
    }
    onNodeIdChanged: resetScope()
    onKindChanged: resetScope()
    onWritableChanged: {
        if (!writable) { resetScope() }
        else { refresh() }
    }
    Component.onCompleted: refresh()
    Component.onDestruction: cancelEdit()
    Connections {
        target: Qt.application
        function onStateChanged() {
            if (Qt.application.state === Qt.ApplicationActive) { root.refresh() }
        }
    }
    Connections {
        target: root.controller
        function onCleared() {
            root.resetScope()
            root.scopeInvalidated()
        }
        function onListed(key, rows) {
            if (key !== root.key || !root.writable) { return }
            root.rows = rows
            root.fetchedAt = Date.now()
            root.loaded = true
            root.loading = false
        }
        function onFailed(key, message) {
            if (key !== root.key) { return }
            root.loading = false
            root.error = message
        }
    }
    RowLayout {
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        Ui.Select {
            id: select
            objectName: "document-select"
            Layout.fillWidth: true
            accessibleName: "Select " + root.kind
            options: (root.loading ? [{label: "Loading…", enabled: false}] : [])
                .concat(root.error ? [{label: "Error: " + root.error, enabled: false}] : [])
                .concat(root.rows.map(row => ({label: row.name || root.untitledLabel, value: row.id})))
            value: root.selectedId
            enabled: root.writable
            onDownChanged: if (down) { root.refresh() }
            onValueCommitted: value => root.choose(value)
        }
        Ui.ToolbarIconButton {
            objectName: "document-open"
            visible: root.showOpen
            accessibleName: root.openEditorLabel
            iconName: root.kind === "timeline" ? "movieOutlined" : root.kind === "sketch" ? "brushOutlined" : root.kind === "storyboard" ? "viewCarouselOutlined" : "descriptionOutlined"
            enabled: root.writable && root.controller && root.selectedId !== ""
            onClicked: root.controller.open(root.kind, root.selectedId)
        }
    }
}

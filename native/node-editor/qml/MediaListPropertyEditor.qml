import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "media-list-editor-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    required property string nodeId
    property bool previewReady: true
    // The tab's AssetPickerController, MediaResolver and ResourcePickerController,
    // passed to the previews and the picker.
    property var controller: null
    property var resolver: null
    property var resourceController: null
    readonly property var entries: value && typeof value !== "string" && typeof value.length === "number" ? Array.from(value) : []
    signal valueCommitted(var value)
    signal scopeInvalidated()
    spacing: Ui.Metrics.md
    function cancelEdit() { picker.cancelEdit() }
    function resetScope() { picker.resetScope(); previewReady = false; previewRestart.restart() }
    function append(references) {
        if (!writable || !references.length) return
        valueCommitted(entries.concat(Array.from(references)))
    }
    function removeAt(index) {
        if (!writable || index < 0 || index >= entries.length) return
        const next = entries.slice(); next.splice(index, 1); valueCommitted(next)
    }
    function moveAt(index, delta) {
        const destination = index + delta
        if (!writable || index < 0 || index >= entries.length || destination < 0 || destination >= entries.length) return
        const next = entries.slice(); const entry = next.splice(index, 1)[0]; next.splice(destination, 0, entry); valueCommitted(next)
    }
    Repeater {
        model: root.previewReady ? root.entries : []
        delegate: ColumnLayout {
            id: entryRow
            required property int index
            required property var modelData
            Layout.fillWidth: true
            spacing: Ui.Metrics.xs
            MediaPreview {
                Layout.fillWidth: true
                mediaKind: root.descriptor.mediaType
                locator: parent.modelData
                requestKey: "media-list-preview-" + String(root) + "-" + String(parent)
                resolver: root.resolver
            }
            RowLayout {
                spacing: Ui.Metrics.xs
                NodeButton { text: "Up"; accessibleName: "Move item " + (entryRow.index + 1) + " up"; enabled: root.writable && entryRow.index > 0; onClicked: root.moveAt(entryRow.index, -1) }
                NodeButton { text: "Down"; accessibleName: "Move item " + (entryRow.index + 1) + " down"; enabled: root.writable && entryRow.index + 1 < root.entries.length; onClicked: root.moveAt(entryRow.index, 1) }
                NodeButton { text: "Remove"; accessibleName: "Remove item " + (entryRow.index + 1); enabled: root.writable; onClicked: root.removeAt(entryRow.index) }
            }
        }
    }
    Timer { id: previewRestart; interval: 0; onTriggered: root.previewReady = true }
    AssetPropertyEditor {
        id: picker
        Layout.fillWidth: true
        descriptor: root.descriptor
        value: null
        writable: root.writable
        nodeId: root.nodeId
        multipleFiles: true
        controller: root.controller
        resolver: root.resolver
        resourceController: root.resourceController
        dropZoneOnly: true
        onReferencesCommitted: values => root.append(values)
        onScopeInvalidated: root.scopeInvalidated()
    }
}

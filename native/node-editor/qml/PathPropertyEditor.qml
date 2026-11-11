import QtQuick
import QtQuick.Window
import QtQuick.Layouts
import QtQuick.Dialogs
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "path-editor-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    property var dialogProvider: null
    property int generation: 0
    property int dialogGeneration: -1
    readonly property bool folder: descriptor.kind === "folder_path"
    signal valueCommitted(var value)
    spacing: Ui.Metrics.xs
    function cancelEdit() {
        ++generation
        fileDialog.close()
        folderDialog.close()
    }
    function resetScope() {
        cancelEdit()
    }
    function acceptPath(url, epoch) {
        if (writable && epoch === generation && url.toString().startsWith("file://")) {
            valueCommitted(decodeURIComponent(url.toString().replace(/^file:\/\//, "")))
        }
    }
    onValueChanged: cancelEdit()
    RowLayout {
        Layout.fillWidth: true
        spacing: Ui.Metrics.md
        NodeButton {
            objectName: "path-browse-" + root.descriptor.name
            text: "Browse…"
            enabled: root.writable
            onClicked: {
                root.dialogGeneration = root.generation
                if (root.dialogProvider) {
                    root.acceptPath(root.dialogProvider(root.folder, root.value), root.dialogGeneration)
                } else if (root.folder) {
                    folderDialog.open()
                } else {
                    fileDialog.open()
                }
            }
        }
        Ui.Text {
            Layout.fillWidth: true
            text: typeof root.value === "string" ? root.value : ""
            role: Ui.Typography.SansCaption
            wrapMode: Text.WrapAnywhere
        }
        Ui.CloseButton {
            objectName: "path-clear-" + root.descriptor.name
            accessibleName: "Clear selection"
            visible: typeof root.value === "string" && root.value !== ""
            enabled: root.writable && typeof root.value === "string" && root.value !== ""
            onClicked: root.valueCommitted("")
        }
    }
    FileDialog {
        id: fileDialog
        parentWindow: root.Window.window
        title: "Select file"
        fileMode: FileDialog.OpenFile
        nameFilters: ["All files (*)"]
        onAccepted: root.acceptPath(selectedFile, root.dialogGeneration)
    }
    FolderDialog {
        id: folderDialog
        parentWindow: root.Window.window
        title: "Select folder"
        onAccepted: root.acceptPath(selectedFolder, root.dialogGeneration)
    }
}

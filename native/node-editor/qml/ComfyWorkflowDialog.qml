pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Dialogs
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// ComfyWorkflowLoader.tsx's dialog: paste API-format JSON or choose a .json or
// .png exported by ComfyUI, then pick the extra parameters to expose.
Rectangle {
    id: root
    objectName: "comfy-workflow-dialog"
    // The dialog's ComfyWorkflowLoader.
    required property var loader
    property var exposed: []
    signal completed()
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
    implicitWidth: Ui.Metrics.standard * 18
    implicitHeight: column.implicitHeight + Ui.Metrics.xl * 2
    function activate() { json.forceActiveFocus(Qt.MouseFocusReason) }
    function toggle(handle) {
        exposed = exposed.includes(handle) ? exposed.filter(entry => entry !== handle) : exposed.concat([handle])
    }
    function apply() {
        if (!loader.ready) return
        loader.apply(exposed)
        completed()
    }
    Connections {
        target: root.loader
        function onTextLoaded(text) { json.text = text }
        function onChanged() { root.exposed = [] }
    }
    Keys.onEscapePressed: root.completed()
    ColumnLayout {
        id: column
        anchors.fill: parent
        anchors.margins: Ui.Metrics.xl
        spacing: Ui.Metrics.sm
        Ui.Text {
            text: "Load ComfyUI workflow"
            role: Ui.Typography.SansTitle
            Accessible.role: Accessible.Heading
        }
        Ui.Text {
            Layout.fillWidth: true
            text: "Paste a workflow in API (prompt) format — use “Save (API Format)” in ComfyUI — or drop a .json/.png file exported by ComfyUI."
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
        Ui.TextArea {
            id: json
            objectName: "comfy-workflow-json"
            Layout.fillWidth: true
            Layout.preferredHeight: Ui.Metrics.standard * 5
            accessibleName: "Workflow JSON"
            placeholderText: "{ \"3\": { \"class_type\": \"KSampler\", \"inputs\": { ... } } }"
            role: Ui.Typography.MonoCode
            onTextChanged: root.loader.setText(text)
        }
        DropArea {
            Layout.fillWidth: true
            implicitHeight: fileRow.implicitHeight
            onDropped: drop => {
                if (drop.hasUrls && drop.urls.length > 0) { root.loader.loadFile(drop.urls[0]); drop.accept() }
            }
            RowLayout {
                id: fileRow
                anchors.fill: parent
                spacing: Ui.Metrics.xs
                Ui.ToolbarIconButton {
                    objectName: "comfy-workflow-choose-file"
                    iconName: "fileUpload"
                    accessibleName: "Choose file"
                    onClicked: fileDialog.open()
                }
                Ui.Text {
                    Layout.fillWidth: true
                    text: "or drop a .json / .png here"
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
            }
        }
        Ui.Text {
            objectName: "comfy-workflow-error"
            Layout.fillWidth: true
            visible: text !== ""
            text: root.loader.error
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Error
            wrapMode: Text.Wrap
        }
        Ui.Text {
            objectName: "comfy-workflow-summary"
            Layout.fillWidth: true
            visible: root.loader.ready
            text: root.loader.summary
            role: Ui.Typography.SansLabel
            wrapMode: Text.Wrap
        }
        Ui.Text {
            visible: root.loader.ready && root.loader.parameters.length > 0
            text: "Expose additional parameters as inputs:"
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        ListView {
            id: parameters
            objectName: "comfy-workflow-parameters"
            visible: root.loader.ready && count > 0
            Layout.fillWidth: true
            Layout.preferredHeight: Math.min(contentHeight, Ui.Metrics.standard * 6)
            clip: true
            model: root.loader.ready ? root.loader.parameters : []
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            delegate: Ui.CheckBox {
                required property var modelData
                objectName: "comfy-parameter-" + modelData.handle
                width: ListView.view.width
                text: modelData.label
                checked: root.exposed.includes(modelData.handle)
                onCheckedChangedByUser: root.toggle(modelData.handle)
            }
        }
        RowLayout {
            Layout.alignment: Qt.AlignRight
            spacing: Ui.Metrics.sm
            Ui.EditorButton { text: "Cancel"; onClicked: root.completed() }
            Ui.EditorButton {
                objectName: "comfy-workflow-apply"
                text: "Apply"
                variant: 1
                enabled: root.loader.ready && !root.loader.busy
                onClicked: root.apply()
            }
        }
    }
    FileDialog {
        id: fileDialog
        parentWindow: root.Window.window
        title: "Choose file"
        fileMode: FileDialog.OpenFile
        nameFilters: ["ComfyUI workflow (*.json *.png)", "All files (*)"]
        onAccepted: root.loader.loadFile(selectedFile)
    }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    required property var controller
    required property string nodeId
    property bool output: false
    property string originalName: ""
    readonly property bool renaming: originalName !== ""
    property bool finished: false
    property bool focusedOnce: false
    signal completed()
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
    implicitWidth: Ui.Metrics.standard * 10
    implicitHeight: column.implicitHeight + Ui.Metrics.lg * 2
    function current() {
        return !finished && controller && controller.selectedNode === nodeId && !controller.readOnly
    }
    function activate() {
        field.forceActiveFocus(Qt.MouseFocusReason)
        field.selectAll()
    }
    function cancel() {
        finished = true
        completed()
    }
    function submit() {
        if (!current()) return
        const name = field.text.trim()
        if (renaming && name === originalName) { cancel(); return }
        const ok = renaming ? controller.renamePort(false, originalName, name)
                            : controller.addPort(output, name, output ? type.value : "")
        if (ok) { finished = true; completed() }
        else Qt.callLater(activate)
    }
    function submitOnBlur() {
        if (renaming && focusedOnce && !field.activeFocus && current()) submit()
    }
    ColumnLayout {
        id: column
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        Ui.Text {
            text: root.renaming ? "Rename input" : root.output ? "Add output" : "Add input"
            role: Ui.Typography.SansLabel
        }
        Ui.TextField {
            id: field
            objectName: "dynamic-port-name"
            Layout.fillWidth: true
            value: root.originalName
            accessibleName: root.renaming ? "Property name" : "Name"
            placeholderText: "Name"
            enabled: root.current()
            onAccepted: root.submit()
            onTextEdited: root.controller.clearError()
            onActiveFocusChanged: {
                if (activeFocus) root.focusedOnce = true
                else Qt.callLater(root.submitOnBlur)
            }
            Keys.priority: Keys.BeforeItem
            Keys.onPressed: event => {
                if (event.key === Qt.Key_Escape && !inputMethodComposing) {
                    root.cancel()
                    event.accepted = true
                } else if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && !inputMethodComposing) {
                    root.submit()
                    event.accepted = true
                }
            }
        }
        Ui.Select {
            id: type
            objectName: "dynamic-port-type"
            visible: root.output && !root.renaming
            Layout.fillWidth: true
            accessibleName: "Type"
            // Ui.Select synchronizes when value changes. Assign the fixed
            // palette first, after construction, before choosing the default.
            Component.onCompleted: {
                options = root.controller.outputTypes
                value = "str"
            }
            onValueCommitted: value => type.value = value
            enabled: root.current()
        }
        Ui.Text {
            objectName: "dynamic-port-error"
            Layout.fillWidth: true
            visible: text !== ""
            text: root.controller ? root.controller.error : ""
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Error
            wrapMode: Text.Wrap
        }
        RowLayout {
            Layout.alignment: Qt.AlignRight
            Ui.EditorButton { text: "Cancel"; onClicked: root.cancel() }
            Ui.EditorButton {
                objectName: "dynamic-port-confirm"
                text: root.renaming ? "Rename" : root.output ? "Add output" : "Add input"
                enabled: root.current()
                onClicked: root.submit()
            }
        }
    }
}

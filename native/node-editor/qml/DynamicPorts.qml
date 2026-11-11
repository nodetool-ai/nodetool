pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    property bool outputsOnly: false
    required property var controller
    spacing: Ui.Metrics.md
    visible: controller.supportsInputs || controller.supportsOutputs
    EditorRoles { id: roles }
    component PortDirection: ColumnLayout {
        id: direction
        required property bool output
        property string draftNode: ""
        Component.onCompleted: draftNode = root.controller.selectedNode
        spacing: Ui.Metrics.xs
        visible: output ? root.controller.supportsOutputs : !root.outputsOnly && root.controller.supportsInputs
        Layout.fillWidth: true
        // A new output starts as str, as AddDynamicOutputDialog.tsx:37 does.
        function defaultType() { return output && typeField.options.some(option => option.value === "str") ? "str" : typeField.options.length ? typeField.options[0].value : "" }
        function cancelDraft() { nameField.text = ""; typeField.value = defaultType(); draftNode = root.controller.selectedNode }
        Connections { target: root.controller; function onChanged() { if (direction.draftNode !== root.controller.selectedNode) direction.cancelDraft() } }
        Ui.Text { text: direction.output ? "Dynamic outputs" : "Dynamic inputs"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
        Repeater {
            model: direction.output ? root.controller.outputs : root.controller.inputs
            delegate: ColumnLayout {
                id: port
                required property var modelData
                property string editNode: ""
                Component.onCompleted: editNode = root.controller.selectedNode
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                Ui.Text { visible: !port.modelData.retypable; text: port.modelData.type + (port.modelData.connected ? " · Connected" : ""); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                // The web type chip of an unconnected dynamic input (DynamicSlotTypePicker.tsx).
                Ui.Select {
                    objectName: "input-type-" + port.modelData.name
                    visible: port.modelData.retypable
                    Layout.fillWidth: true
                    accessibleName: "Type of input " + port.modelData.name
                    value: port.modelData.typeKey
                    options: root.controller.inputTypes
                    enabled: !root.controller.readOnly
                    onValueCommitted: value => {
                        if (port.editNode === root.controller.selectedNode && value !== port.modelData.typeKey)
                            root.controller.setPortType(port.modelData.name, value)
                    }
                }
                Ui.TextField {
                    id: renameField
                    objectName: (direction.output ? "output-name-" : "input-name-") + port.modelData.name
                    Layout.fillWidth: true
                    value: port.modelData.name
                    accessibleName: "Rename " + (direction.output ? "output " : "input ") + port.modelData.name
                    enabled: !root.controller.readOnly
                    background: Rectangle { color: roles.field; radius: Ui.Metrics.radiusControl }
                    // Enter renames, as PropertyInput.tsx:478-486 does. Leaving the field
                    // keeps the draft for the Rename and Cancel buttons. Escape restores
                    // the name through the field's own cancel.
                    onAccepted: if (port.editNode === root.controller.selectedNode && text.trim() !== "" && text !== port.modelData.name) root.controller.renamePort(direction.output, port.modelData.name, text)
                }
                RowLayout {
                    Ui.EditorButton {
                        text: "Rename"
                        objectName: (direction.output ? "rename-output-" : "rename-input-") + port.modelData.name
                        accessibleName: "Rename " + (direction.output ? "output " : "input ") + port.modelData.name
                        enabled: !root.controller.readOnly && renameField.text !== port.modelData.name
                        onClicked: if (port.editNode === root.controller.selectedNode) root.controller.renamePort(direction.output, port.modelData.name, renameField.text)
                    }
                    Ui.EditorButton {
                        objectName: (direction.output ? "delete-output-" : "delete-input-") + port.modelData.name
                        text: port.modelData.connected ? "Delete with connections" : "Delete"
                        accessibleName: "Delete " + (direction.output ? "output " : "input ") + port.modelData.name + (port.modelData.connected ? " and its connections" : "")
                        enabled: !root.controller.readOnly
                        onClicked: if (port.editNode === root.controller.selectedNode) root.controller.removePort(direction.output, port.modelData.name)
                    }
                    Ui.EditorButton { text: "Cancel"; enabled: renameField.text !== port.modelData.name; onClicked: renameField.text = port.modelData.name }
                }
            }
        }
        Ui.TextField {
            id: nameField
            objectName: direction.output ? "new-output-name" : "new-input-name"
            Layout.fillWidth: true
            accessibleName: direction.output ? "New output name" : "New input name"
            placeholderText: accessibleName
            enabled: !root.controller.readOnly
            background: Rectangle { color: roles.field; radius: Ui.Metrics.radiusControl }
            // Enter adds, as the web add dialogs do (NodePropertyForm.tsx:163-168, AddDynamicOutputDialog.tsx:78-94).
            onAccepted: if (direction.draftNode === root.controller.selectedNode && text.trim() !== "" && root.controller.addPort(direction.output, text, typeField.value)) direction.cancelDraft()
        }
        Ui.Select {
            id: typeField
            objectName: direction.output ? "new-output-type" : "new-input-type"
            Layout.fillWidth: true
            accessibleName: direction.output ? "New output type" : "New input type"
            value: direction.defaultType()
            options: direction.output ? root.controller.outputTypes : root.controller.inputTypes
            enabled: !root.controller.readOnly
            onValueCommitted: value => typeField.value = value
        }
        RowLayout {
            Ui.EditorButton {
                objectName: direction.output ? "add-output" : "add-input"
                text: direction.output ? "Add output" : "Add input"
                enabled: !root.controller.readOnly && nameField.text.trim() !== ""
                onClicked: if (direction.draftNode === root.controller.selectedNode && root.controller.addPort(direction.output, nameField.text, typeField.value)) direction.cancelDraft()
            }
            Ui.EditorButton { text: "Cancel"; onClicked: { direction.cancelDraft(); root.controller.clearError() } }
        }
    }
    PortDirection { output: false }
    PortDirection { output: true }
    Ui.Text { role: Ui.Typography.SansCaption; text: root.controller.error; visible: text !== ""; tone: Ui.Text.Error; Layout.fillWidth: true; wrapMode: Text.Wrap }
}

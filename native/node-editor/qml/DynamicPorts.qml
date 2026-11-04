pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
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
        visible: output ? root.controller.supportsOutputs : root.controller.supportsInputs
        Layout.fillWidth: true
        function cancelDraft() { nameField.text = ""; typeField.value = typeField.options.length ? typeField.options[0].value : ""; draftNode = root.controller.selectedNode }
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
                Ui.Text { text: port.modelData.type + (port.modelData.connected ? " · Connected" : ""); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Ui.TextField {
                    id: renameField
                    objectName: (direction.output ? "output-name-" : "input-name-") + port.modelData.name
                    Layout.fillWidth: true
                    value: port.modelData.name
                    accessibleName: "Rename " + (direction.output ? "output " : "input ") + port.modelData.name
                    enabled: !root.controller.readOnly
                    background: Rectangle { color: roles.field; radius: Ui.Metrics.radiusControl }
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
        }
        Ui.Select {
            id: typeField
            objectName: direction.output ? "new-output-type" : "new-input-type"
            Layout.fillWidth: true
            accessibleName: direction.output ? "New output type" : "New input type"
            value: options.length ? options[0].value : ""
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
    Ui.Text { text: root.controller.error; visible: text !== ""; tone: Ui.Text.Error; Layout.fillWidth: true; wrapMode: Text.Wrap }
}

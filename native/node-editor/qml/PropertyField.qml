import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property var descriptor
    required property var host
    required property string nodeId
    property bool multiline: false
    property int commitGeneration: 0
    property string editNodeId: ""
    readonly property var credentialsEpoch: host && typeof host.credentialsEpoch !== "undefined" ? host.credentialsEpoch : 0
    readonly property string descriptorIdentity: JSON.stringify([nodeId, descriptor.storage || "", descriptor.name || "", descriptor.kind || "", descriptor.dataType || {}])
    readonly property var documentEpoch: host && typeof host.documentEpoch !== "undefined" ? host.documentEpoch : 0
    readonly property bool writable: descriptor.editable && (!descriptor.connected || descriptor.appendStatic) && host && !host.readOnly
    readonly property var effectiveValue: descriptor.hasValue ? descriptor.value : descriptor.hasDefault ? descriptor.defaultValue : null
    readonly property string title: descriptor.label || descriptor.name || ""
    // A connected or preserved value explains itself in the hint below the label.
    readonly property string error: descriptor.editable === false || (descriptor.connected && !descriptor.appendStatic) ? "" : (descriptor.error || "")
    spacing: Ui.Metrics.xs
    EditorRoles { id: roles }
    // The web inspector field: a quiet translucent fill with no idle border.
    component FieldFrame: Rectangle {
        required property Item control
        color: !control.enabled ? roles.fieldDisabled : control.activeFocus ? roles.fieldFocus : roles.field
        radius: Ui.Metrics.radiusControl
        border.width: control.activeFocus ? Ui.Metrics.focus : Ui.Metrics.border
        border.color: control.valid === false ? Ui.Theme.borderError : control.activeFocus ? Ui.Theme.borderFocus : "transparent"
    }
    function begin() { editNodeId = nodeId }
    function commit(value) {
        if (!writable || editNodeId !== nodeId || host.selection !== editNodeId) return
        const generation = commitGeneration
        const target = host
        const id = editNodeId
        const name = descriptor.name
        Qt.callLater(function() {
            if (root.commitGeneration === generation && root.writable && root.host === target && root.nodeId === id && target.selection === id)
                target.commitProperty(id, name, value)
        })
    }
    function cancelDraft() {
        ++commitGeneration
        if (fieldLoader.item && fieldLoader.item.cancelEdit) fieldLoader.item.cancelEdit()
    }
    function resetFieldScope() {
        ++commitGeneration; editNodeId = ""; multiline = false
        if (typeof fieldLoader === "undefined" || !fieldLoader || !fieldLoader.item) return
        if (fieldLoader.item.resetScope) fieldLoader.item.resetScope()
        else if (fieldLoader.item.cancelEdit) fieldLoader.item.cancelEdit()
    }
    onDescriptorIdentityChanged: resetFieldScope()
    onDocumentEpochChanged: resetFieldScope()
    onCredentialsEpochChanged: resetFieldScope()
    onHostChanged: resetFieldScope()
    onWritableChanged: if (!writable) resetFieldScope()
    function removeValue() {
        cancelDraft()
        if (!writable || host.selection !== nodeId) return
        const generation = commitGeneration, target = host, id = nodeId, name = descriptor.name
        Qt.callLater(function() {
            if (root.commitGeneration === generation && root.writable && root.host === target && root.nodeId === id && target.selection === id)
                target.removeProperty(id, name)
        })
    }
    function immediate(value) { cancelDraft(); begin(); commit(value) }
    Ui.Text {
        text: root.title + (root.descriptor.required ? " *" : "")
        role: Ui.Typography.SansLabel
        font.weight: Font.Normal
        tone: root.writable ? Ui.Text.Secondary : Ui.Text.Disabled
        Layout.fillWidth: true
        wrapMode: Text.Wrap
    }
    Loader {
        id: fieldLoader
        Layout.fillWidth: true
        // The web inspector shows a connected input as its dimmed label alone.
        visible: !root.descriptor.connected || root.descriptor.appendStatic === true
        sourceComponent: root.descriptor.kind === "text" ? (root.multiline ? multilineField : textField)
            : root.descriptor.kind === "multiline" ? multilineField
            : ["number", "integer"].includes(root.descriptor.kind) ? numberField
            : root.descriptor.kind === "boolean" ? booleanField
            : root.descriptor.kind === "choice" ? choiceField
            : root.descriptor.kind === "model" ? modelField
            : root.descriptor.kind === "media" ? mediaField
            : root.descriptor.kind === "media_list" ? mediaListField
            : root.descriptor.kind === "color" ? colorField
            : root.descriptor.kind === "image_size" ? imageSizeField
            : ["workflow", "workflow_list"].includes(root.descriptor.kind) ? workflowField
            : root.descriptor.kind === "collection" ? collectionField
            : ["list", "dict", "json", "record_type"].includes(root.descriptor.kind) ? structuredField : preservedField
    }
    Component {
        id: textField
        Ui.TextField {
            objectName: "property-" + root.descriptor.name
            value: typeof root.effectiveValue === "string" ? root.effectiveValue : ""
            placeholderText: root.effectiveValue === null ? "Not set" : ""
            accessibleName: root.title
            enabled: root.writable
            valid: true
            errorText: root.error
            topPadding: Ui.Metrics.sm; bottomPadding: Ui.Metrics.sm
            leftPadding: 10; rightPadding: 10
            implicitHeight: 34
            font.weight: Font.Normal
            background: FieldFrame { control: parent }
            onEditStarted: root.begin()
            onValueCommitted: value => root.commit(value)
        }
    }
    Component {
        id: multilineField
        Ui.TextArea {
            objectName: "property-" + root.descriptor.name
            value: typeof root.effectiveValue === "string" ? root.effectiveValue : ""
            placeholderText: root.effectiveValue === null ? "Not set" : ""
            implicitHeight: Math.max(contentHeight + Ui.Metrics.xl, Ui.Metrics.touch * 2)
            role: Ui.Typography.SansLabel
            font.weight: Font.Normal
            background: FieldFrame { control: parent }
            accessibleName: root.title
            enabled: root.writable
            valid: true
            errorText: root.error
            onEditStarted: root.begin()
            onValueCommitted: value => root.commit(value)
        }
    }
    Component {
        id: numberField
        Ui.NumberField {
            objectName: "property-" + root.descriptor.name
            value: typeof root.effectiveValue === "number" ? root.effectiveValue : 0
            displayValue: typeof root.effectiveValue === "number" ? String(root.effectiveValue) : ""
            placeholderText: "Not set"
            from: typeof root.descriptor.min === "number" ? root.descriptor.min : -Infinity
            to: typeof root.descriptor.max === "number" ? root.descriptor.max : Infinity
            stepSize: typeof root.descriptor.step === "number" ? root.descriptor.step : 1
            accessibleName: root.title
            enabled: root.writable
            valid: (root.descriptor.kind !== "integer" || text.trim() === "" || Number.isInteger(Number(text)))
            errorText: root.error || "Enter a valid " + root.descriptor.kind + " within the allowed range."
            background: FieldFrame { control: parent }
            onEditStarted: root.begin()
            onValueCommitted: value => root.commit(value)
        }
    }
    Component {
        id: booleanField
        Ui.CheckBox {
            objectName: "property-" + root.descriptor.name
            text: root.effectiveValue === null ? "Not set" : "Enabled"
            checked: root.effectiveValue === true
            accessibleName: root.title
            enabled: root.writable
            onCheckedChangedByUser: checked => root.immediate(checked)
        }
    }
    Component {
        id: choiceField
        Ui.Select {
            objectName: "property-" + root.descriptor.name
            options: root.descriptor.options || []
            value: root.effectiveValue
            accessibleName: root.title
            enabled: root.writable
            valid: true
            errorText: root.error
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: structuredField
        StructuredPropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            onEditStarted: root.begin()
            onValueCommitted: value => root.commit(value)
        }
    }
    Component {
        id: collectionField
        CollectionPropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            nodeId: root.nodeId
            onScopeInvalidated: { ++root.commitGeneration; root.editNodeId = "" }
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: workflowField
        WorkflowPropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            nodeId: root.nodeId
            onScopeInvalidated: { ++root.commitGeneration; root.editNodeId = "" }
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: colorField
        ColorPropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: imageSizeField
        ImageSizePropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: mediaListField
        MediaListPropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            nodeId: root.nodeId
            onScopeInvalidated: { ++root.commitGeneration; root.editNodeId = "" }
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: mediaField
        AssetPropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            nodeId: root.nodeId
            onScopeInvalidated: { ++root.commitGeneration; root.editNodeId = "" }
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: modelField
        ModelPropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: preservedField
        Ui.Text {
            text: root.effectiveValue === null ? "Not set" : JSON.stringify(root.effectiveValue, null, 2)
            role: Ui.Typography.MonoCaption
            wrapMode: Text.WrapAnywhere
        }
    }
    Ui.Text {
        visible: text !== ""
        text: root.descriptor.description || ""
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Disabled
        Layout.fillWidth: true
        wrapMode: Text.Wrap
    }
    Ui.Text {
        visible: text !== ""
        text: root.descriptor.conditionalUnavailable ? "Unavailable for the selected settings"
            : root.descriptor.connected && root.descriptor.appendStatic ? "Connected items precede these editable static items."
            : root.descriptor.connected ? "Connected input. Disconnect it to edit this value."
            : !root.descriptor.editable ? "This value is preserved. A dedicated editor is required."
            : root.descriptor.hasValue && root.descriptor.value === null ? "Stored null. Choose a value to replace it."
            : !root.descriptor.hasValue && !root.descriptor.hasDefault ? "Not set. This property is omitted."
            : !root.descriptor.hasValue && root.descriptor.hasDefault ? "Using the metadata default." : ""
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Disabled
        Layout.fillWidth: true
        wrapMode: Text.Wrap
    }
    Ui.Text {
        visible: text !== ""
        tone: Ui.Text.Error
        text: root.error || (fieldLoader.item && ["number", "integer"].includes(root.descriptor.kind) && (!fieldLoader.item.draftValid || !fieldLoader.item.valid) ? "Enter a valid " + root.descriptor.kind + " within the allowed range." : "")
        role: Ui.Typography.SansCaption
        Layout.fillWidth: true
        wrapMode: Text.Wrap
    }
    NodeButton {
        variant: NodeButton.Flat
        leftPadding: 0
        Layout.alignment: Qt.AlignLeft
        visible: root.descriptor.kind === "text" && root.writable
        text: root.multiline ? "Use single line" : "Edit multiple lines"
        onClicked: {
            if (fieldLoader.item && fieldLoader.item.cancelEdit) fieldLoader.item.cancelEdit()
            root.multiline = !root.multiline
        }
    }
    RowLayout {
        visible: root.writable && (root.descriptor.nullable === true || root.descriptor.hasDefault === true || root.descriptor.required === false)
        spacing: Ui.Metrics.md
        NodeButton {
            variant: NodeButton.Flat
            leftPadding: 0
            onPressed: root.cancelDraft()
            text: "Set null"
            visible: root.descriptor.nullable === true
            enabled: !root.descriptor.hasValue || root.descriptor.value !== null
            onClicked: root.immediate(null)
        }
        NodeButton {
            variant: NodeButton.Flat
            leftPadding: 0
            onPressed: root.cancelDraft()
            text: "Clear value"
            visible: root.descriptor.required === false && !root.descriptor.hasDefault
            enabled: root.descriptor.hasValue
            onClicked: {
                root.removeValue()
            }
        }
        NodeButton {
            variant: NodeButton.Flat
            leftPadding: 0
            onPressed: root.cancelDraft()
            text: "Use default"
            visible: root.descriptor.hasDefault === true
            enabled: root.descriptor.hasValue
            onClicked: {
                root.removeValue()
            }
        }
    }
}

import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.NodeEditor

ColumnLayout {
    id: root
    required property var descriptor
    required property PropertyHost host
    required property string nodeId
    property bool multiline: false
    property int commitGeneration: 0
    property string editNodeId: ""
    readonly property var credentialsEpoch: host.credentialsEpoch
    readonly property string descriptorIdentity: JSON.stringify([nodeId, descriptor.storage || "", descriptor.name || "", descriptor.kind || "", descriptor.dataType || {}])
    readonly property var documentEpoch: host.documentEpoch
    readonly property bool writable: descriptor.editable && (!descriptor.connected || descriptor.appendStatic) && !host.readOnly
    readonly property var effectiveValue: descriptor.hasValue ? descriptor.value : descriptor.hasDefault ? descriptor.defaultValue : null
    readonly property string title: descriptor.label || descriptor.name || ""
    // A connected or preserved value explains itself in the hint below the label.
    readonly property string error: descriptor.editable === false || (descriptor.connected && !descriptor.appendStatic) ? "" : (descriptor.error || "")
    spacing: Ui.Metrics.xs
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
    // The web inspector shows a property description as the label tooltip.
    RowLayout {
        Layout.fillWidth: true
        spacing: Ui.Metrics.sm
        Ui.Text {
            id: fieldLabel
            text: root.title + (root.descriptor.required ? " *" : "")
            role: Ui.Typography.SansLabel
            weight: Font.Normal
            tone: root.writable ? Ui.Text.Secondary : Ui.Text.Disabled
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            readonly property string helpText: root.descriptor.description || ""
            Accessible.description: helpText
            HoverHandler { id: labelHover }
            Ui.Tooltip {
                trigger: fieldLabel
                visible: labelHover.hovered && fieldLabel.helpText !== ""
                text: fieldLabel.helpText
            }
        }
        // The web marks a value that differs from its default (property-input-container.value-changed).
        Rectangle {
            objectName: "changed-marker"
            visible: root.descriptor.changed === true
            Layout.preferredWidth: Ui.Metrics.sm
            Layout.preferredHeight: Ui.Metrics.sm
            radius: Ui.Metrics.radiusPill
            color: Ui.Theme.accentPrimary
            Accessible.role: Accessible.StaticText
            Accessible.name: "Changed from default"
        }
    }
    // The web resets a changed property on Ctrl or Cmd with a right click.
    TapHandler {
        acceptedButtons: Qt.RightButton
        acceptedModifiers: Qt.ControlModifier
        onTapped: if (root.descriptor.changed === true) root.removeValue()
    }
    TapHandler {
        acceptedButtons: Qt.RightButton
        acceptedModifiers: Qt.MetaModifier
        onTapped: if (root.descriptor.changed === true) root.removeValue()
    }
    Loader {
        id: fieldLoader
        Layout.fillWidth: true
        // The web inspector shows a connected input as its dimmed label alone.
        visible: !root.descriptor.connected || root.descriptor.appendStatic === true || root.descriptor.kind === "model3d"
        sourceComponent: root.descriptor.name === "code" && ["text", "multiline"].includes(root.descriptor.kind) ? codeField
            : root.descriptor.kind === "text" ? (root.multiline ? multilineField : textField)
            : root.descriptor.kind === "multiline" ? multilineField
            : ["number", "integer"].includes(root.descriptor.kind) ? numberField
            : root.descriptor.kind === "boolean" ? booleanField
            : root.descriptor.kind === "choice" ? choiceField
            : root.descriptor.kind === "model" ? modelField
            : root.descriptor.kind === "model3d" ? model3dField
            : root.descriptor.kind === "media" ? mediaField
            : root.descriptor.kind === "media_list" ? mediaListField
            : root.descriptor.kind === "color" ? colorField
            : root.descriptor.kind === "image_size" ? imageSizeField
            : ["workflow", "workflow_list"].includes(root.descriptor.kind) ? workflowField
            : root.descriptor.kind === "document_ref" ? documentField
            : root.descriptor.kind === "collection" ? collectionField
            : ["font", "folder", "entity", "entity_list"].includes(root.descriptor.kind) ? remainingResourceField
            : ["file_path", "folder_path"].includes(root.descriptor.kind) ? pathField
            : root.descriptor.kind === "tools" ? toolsField
            : root.descriptor.kind.startsWith("media_") && !["media_list"].includes(root.descriptor.kind) ? mediaParameterField
            : root.descriptor.kind === "document" ? (["nodetool.constant.Document", "nodetool.input.DocumentInput"].includes(root.descriptor.nodeType) ? documentAssetField : documentIdField)
            : root.descriptor.kind === "file" ? fileField
            : ["list", "dict", "json", "record_type"].includes(root.descriptor.kind) ? structuredField : preservedField
    }
    Component {
        id: codeField
        CodePropertyEditor {
            value: typeof root.effectiveValue === "string" ? root.effectiveValue : ""
            writable: root.writable
            nodeType: root.descriptor.nodeType || ""
            onEditStarted: root.begin()
            onValueCommitted: value => root.commit(value)
        }
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
            leftPadding: Ui.Metrics.nodeFieldPadding; rightPadding: Ui.Metrics.nodeFieldPadding
            implicitHeight: Ui.Metrics.nodeFieldHeight
            font.weight: Font.Normal
            variant: Ui.TextField.Node
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
            variant: Ui.TextArea.Node
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
            variant: Ui.NumberField.Node
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
        id: model3dField
        Model3DPropertyEditor {
            controller: root.host.assetPicker
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            nodeId: root.nodeId
            onScopeInvalidated: {
                ++root.commitGeneration
                root.editNodeId = ""
            }
            onReportRequested: (source, text) => root.host.reportError(source, text)
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: documentField
        DocumentPropertyEditor {
            controller: root.host.documentPicker
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            nodeId: root.nodeId
            onScopeInvalidated: {
                ++root.commitGeneration
                root.editNodeId = ""
            }
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: remainingResourceField
        RemainingResourcePropertyEditor {
            controller: root.host.resourcePicker
            resolver: root.host.media
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            nodeId: root.nodeId
            onScopeInvalidated: {
                ++root.commitGeneration
                root.editNodeId = ""
            }
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: pathField
        PathPropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: toolsField
        ToolsPropertyEditor {
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: mediaParameterField
        MediaParameterPropertyEditor {
            controller: root.host.resourcePicker
            descriptor: root.descriptor
            value: root.effectiveValue
            writable: root.writable
            onScopeInvalidated: {
                ++root.commitGeneration
                root.editNodeId = ""
            }
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: documentIdField
        Ui.Text {
            objectName: "document-reference-" + root.descriptor.name
            text: root.effectiveValue && root.effectiveValue.id || ""
            role: Ui.Typography.SansCaption
            wrapMode: Text.WrapAnywhere
        }
    }
    Component {
        id: fileField
        FilePropertyEditor {
            objectName: "file-reference-" + root.descriptor.name
            value: root.effectiveValue
        }
    }
    Component {
        id: documentAssetField
        AssetPropertyEditor {
            controller: root.host.assetPicker
            resolver: root.host.media
            resourceController: root.host.resourcePicker
            descriptor: Object.assign({}, root.descriptor, {mediaType: "document"})
            value: root.effectiveValue
            writable: root.writable
            nodeId: root.nodeId
            onScopeInvalidated: {
                ++root.commitGeneration
                root.editNodeId = ""
            }
            onValueCommitted: value => root.immediate(value)
        }
    }
    Component {
        id: collectionField
        CollectionPropertyEditor {
            controller: root.host.resourcePicker
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
            controller: root.host.resourcePicker
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
            controller: root.host.assetPicker
            resolver: root.host.media
            resourceController: root.host.resourcePicker
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
            controller: root.host.assetPicker
            resolver: root.host.media
            resourceController: root.host.resourcePicker
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
            controller: root.host.modelPicker
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
        visible: text !== "" && !["document_ref", "model3d"].includes(root.descriptor.kind)
        text: root.descriptor.conditionalUnavailable ? "Unavailable for the selected settings"
            : root.descriptor.connected && root.descriptor.appendStatic ? "Connected items precede these editable static items."
            : root.descriptor.connected ? "Connected input. Disconnect it to edit this value."
            : !root.descriptor.editable ? "This value is preserved. A dedicated editor is required."
            : root.descriptor.hasValue && root.descriptor.value === null ? "Stored null. Choose a value to replace it."
            : !root.descriptor.hasValue && !root.descriptor.hasDefault ? "Not set. This property is omitted." : ""
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
    Ui.EditorButton {
        variant: Ui.EditorButton.Outlined; flat: true
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
        // A value at its default shows no reset action, as on the web.
        visible: root.writable && (root.descriptor.nullable === true
            || (root.descriptor.required === false && !root.descriptor.hasDefault)
            || root.descriptor.changed === true)
        spacing: Ui.Metrics.md
        Ui.EditorButton {
            variant: Ui.EditorButton.Outlined; flat: true
            leftPadding: 0
            onPressed: root.cancelDraft()
            text: "Set null"
            visible: root.descriptor.nullable === true
            enabled: !root.descriptor.hasValue || root.descriptor.value !== null
            onClicked: root.immediate(null)
        }
        Ui.EditorButton {
            variant: Ui.EditorButton.Outlined; flat: true
            leftPadding: 0
            onPressed: root.cancelDraft()
            text: "Clear value"
            visible: root.descriptor.required === false && !root.descriptor.hasDefault
            enabled: root.descriptor.hasValue
            onClicked: {
                root.removeValue()
            }
        }
        Ui.EditorButton {
            variant: Ui.EditorButton.Outlined; flat: true
            leftPadding: 0
            onPressed: root.cancelDraft()
            objectName: "reset-default"
            text: "Reset to default"
            visible: root.descriptor.changed === true
            enabled: root.descriptor.changed === true
            onClicked: {
                root.removeValue()
            }
        }
    }
}

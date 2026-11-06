import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "EntityKind.js" as Kind

Ui.Dialog {
    id: dialog
    objectName: "entityEditorDialog"
    property var library: null
    // The shared generation and writing-assistant service of the panel.
    property var assist: null
    // The entity being edited, or null while creating one from an image.
    property var entity: null
    property string referenceAssetId: ""
    property string kind: "character"
    // Hides a save error as soon as the draft changes, since the cause may be fixed.
    property bool errorVisible: false
    property alias changeButton: changeImage
    readonly property bool editing: !!entity && !!entity.id
    readonly property bool saving: !!library && library.saving
    readonly property bool canSave: nameField.text.trim() !== "" && descriptorField.text.trim() !== ""
    readonly property string imageUrl: library && referenceAssetId !== "" && library.imageUrls[referenceAssetId] ? library.imageUrls[referenceAssetId] : ""
    readonly property string saveReason: "Add a name and a descriptor to save."
    readonly property real previewSize: 96 * Ui.Theme.uiScale
    signal changeImageRequested()
    signal newPictureRequested()
    readonly property alias descriptorText: descriptorField
    readonly property alias nameText: nameField
    readonly property alias assistButton: assistTrigger
    readonly property alias newPictureButton: newPicture
    function openAssist() {
        if (!assistPopover) assistPopover = assistComponent.createObject(dialog)
        assistPopover.openBeside(dialog, assistTrigger)
    }
    // The assistant belongs to the entity being edited, so it never outlives this form or moves to another.
    function closeAssist() {
        if (assistPopover) assistPopover.dismiss()
    }
    function setDescriptor(text) {
        descriptorField.cancelEdit()
        descriptorField.value = text
        descriptorField.text = text
        errorVisible = false
    }
    function loadFields(source) {
        const fields = [[nameField, source ? source.name || "" : ""], [descriptorField, source ? source.descriptor || "" : ""],
            [voiceField, source ? source.voice_id || "" : ""], [tagsField, source && source.tags ? source.tags.join(", ") : ""]]
        for (const [field, text] of fields) {
            field.cancelEdit()
            field.value = text
            field.text = text
        }
        kind = source && source.kind ? source.kind : "character"
        scroll.contentY = 0
        errorVisible = false
    }
    function openNew(imageId) {
        closeAssist()
        entity = null
        referenceAssetId = imageId
        loadFields(null)
        open()
    }
    function openEdit(row) {
        closeAssist()
        entity = row
        referenceAssetId = row.referenceAssetId || row.id
        loadFields(row)
        open()
    }
    function submit() {
        if (!canSave || saving) return
        errorVisible = false
        library.save({
            id: editing ? entity.id : "",
            referenceAssetId: referenceAssetId,
            kind: kind,
            name: nameField.text,
            descriptor: descriptorField.text,
            voiceId: kind === "character" ? voiceField.text : "",
            tags: tagsField.text.split(",").map(tag => tag.trim()).filter(tag => tag !== "")
        })
    }
    title: editing ? "Edit entity" : "New entity"
    // The wide dialog gives the four kind buttons room beside the picture. A narrow window stacks them.
    width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width - Ui.Metrics.xl * 2 : Ui.Metrics.dialogWidth)
    height: Math.min(implicitHeight, parent ? parent.height - Ui.Metrics.xl * 2 : implicitHeight)
    // The dialog adds its padding under the header. Cancel it so the form sits Metrics.md below the title.
    spacing: Ui.Metrics.micro - topPadding
    // A save in flight cannot be abandoned, or its result would land on a later edit.
    closePolicy: saving ? Popup.NoAutoClose : Popup.CloseOnEscape
    onOpened: { nameField.forceActiveFocus(); nameField.selectAll() }
    onClosed: closeAssist()
    onReferenceAssetIdChanged: errorVisible = false

    property bool wasSaving: false
    Connections {
        target: dialog.library
        function onSaved() { if (dialog.visible) dialog.close() }
        function onChanged() {
            const failed = dialog.wasSaving && !dialog.library.saving && dialog.library.saveError !== ""
            dialog.wasSaving = dialog.library.saving
            if (failed && dialog.visible) dialog.errorVisible = true
        }
    }

    // Built on first use, so the writing model list is not fetched until someone asks for the assistant.
    property var assistPopover: null
    Component {
        id: assistComponent
        EntityAssistPopover {
            assist: dialog.assist
            kind: dialog.kind
            entityName: dialog.nameText.text
            // The fields are read live, so text typed behind the popover is what a rewrite uses and what Replace overwrites.
            fieldText: dialog.descriptorText.text
            onApplied: text => dialog.setDescriptor(text)
        }
    }
    component FieldLabel: Ui.Text {
        Layout.fillWidth: true
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        wrapMode: Text.Wrap
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.md
        Ui.Banner {
            objectName: "entitySaveError"
            visible: dialog.errorVisible && !!dialog.library && dialog.library.saveError !== ""
            Layout.fillWidth: true
            status: Ui.Status.Error
            message: dialog.library ? dialog.library.saveError : ""
        }
        Flickable {
            id: scroll
            objectName: "entityEditorScroll"
            Layout.fillWidth: true
            Layout.fillHeight: true
            implicitHeight: body.implicitHeight
            clip: true
            contentWidth: width
            contentHeight: body.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: Ui.ScrollBar {}
            // Scrolls a field into view when keyboard focus reaches it.
            function reveal(item) {
                let inside = false
                for (let ancestor = item; ancestor; ancestor = ancestor.parent) {
                    if (ancestor === body) { inside = true; break }
                }
                if (!inside) return
                const top = item.mapToItem(body, 0, 0).y - Ui.Metrics.xxl
                const bottom = item.mapToItem(body, 0, item.height).y + Ui.Metrics.md
                if (top < contentY) contentY = Math.max(0, top)
                else if (bottom > contentY + height) contentY = Math.min(contentHeight - height, bottom - height)
            }
            Connections {
                target: body.Window.window
                function onActiveFocusItemChanged() { scroll.reveal(body.Window.window.activeFocusItem) }
            }
            // The dialog settles to its final height after opening, so reveal again once it does.
            onHeightChanged: if (dialog.visible && body.Window.window) reveal(body.Window.window.activeFocusItem)
            ColumnLayout {
                id: body
                // A scrollbar gutter appears only while the form is taller than the dialog.
                width: scroll.width - (scroll.height + 2 < body.implicitHeight ? Ui.Metrics.md : 0)
                spacing: Ui.Metrics.lg
                GridLayout {
                    id: topRow
                    Layout.fillWidth: true
                    columns: body.width < Ui.Metrics.dialogCompactWidth ? 1 : 2
                    columnSpacing: Ui.Metrics.md
                    rowSpacing: Ui.Metrics.lg
                    ColumnLayout {
                        Layout.alignment: Qt.AlignTop
                        Layout.fillWidth: false
                        spacing: Ui.Metrics.xs
                        FieldLabel { text: "Image" }
                        Rectangle {
                            objectName: "entityEditorPreview"
                            Layout.preferredWidth: dialog.previewSize
                            Layout.preferredHeight: dialog.previewSize
                            color: Ui.Theme.surfaceInput
                            radius: Ui.Metrics.radiusControl
                            Image {
                                id: preview
                                anchors.fill: parent
                                anchors.margins: Ui.Metrics.micro
                                source: dialog.imageUrl
                                asynchronous: true
                                fillMode: Image.PreserveAspectCrop
                                sourceSize: Qt.size(width * 2, height * 2)
                                visible: status === Image.Ready
                            }
                            Ui.Text {
                                anchors.centerIn: parent
                                visible: !preview.visible && (dialog.imageUrl === "" || preview.status === Image.Error)
                                text: "No image"
                                role: Ui.Typography.SansCaption
                                tone: Ui.Text.Secondary
                            }
                            Rectangle {
                                anchors.fill: parent
                                radius: parent.radius
                                color: "transparent"
                                border.width: Ui.Metrics.border
                                border.color: Ui.Theme.borderSubtle
                            }
                        }
                        Ui.EditorButton {
                            id: changeImage
                            objectName: "entityChangeImage"
                            Layout.fillWidth: true
                            density: Ui.EditorButton.Compact
                            text: "Change image"
                            onClicked: dialog.changeImageRequested()
                        }
                        Ui.EditorButton {
                            id: newPicture
                            objectName: "entityNewPicture"
                            Layout.fillWidth: true
                            density: Ui.EditorButton.Compact
                            iconName: "autoAwesome"
                            text: "New picture"
                            accessibleName: "Create a new picture with AI"
                            enabled: !!dialog.assist
                            onClicked: dialog.newPictureRequested()
                        }
                    }
                    ColumnLayout {
                        Layout.fillWidth: true
                        Layout.alignment: Qt.AlignTop
                        spacing: Ui.Metrics.lg
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.xs
                            FieldLabel { text: "Kind" }
                            RowLayout {
                                Layout.fillWidth: true
                                spacing: Ui.Metrics.xs
                                Repeater {
                                    model: Kind.kinds
                                    Ui.EditorButton {
                                        id: kindButton
                                        required property string modelData
                                        objectName: "entityKind_" + modelData
                                        Layout.fillWidth: true
                                        Layout.preferredWidth: 1
                                        density: Ui.EditorButton.Compact
                                        // Accent marks the chosen kind, so a hover is never mistaken for it.
                                        variant: checked ? Ui.EditorButton.Primary : Ui.EditorButton.Default
                                        text: Kind.label(modelData)
                                        checkable: true
                                        autoExclusive: true
                                        checked: dialog.kind === modelData
                                        onClicked: { dialog.kind = modelData; dialog.errorVisible = false }
                                    }
                                }
                            }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.xs
                            FieldLabel { text: "Name (required)" }
                            Ui.TextField {
                                id: nameField
                                objectName: "entityNameField"
                                Layout.fillWidth: true
                                accessibleName: "Name"
                                selectByMouse: true
                                onValuePreviewed: dialog.errorVisible = false
                                onAccepted: dialog.submit()
                            }
                        }
                    }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.xs
                        FieldLabel { text: "Descriptor (required)"; Layout.alignment: Qt.AlignVCenter }
                        Ui.ToolbarIconButton {
                            id: assistTrigger
                            objectName: "entityAssistButton"
                            iconName: "autoAwesome"
                            accessibleName: "Writing assistant"
                            enabled: !!dialog.assist
                            onClicked: dialog.openAssist()
                        }
                    }
                    Ui.TextArea {
                        id: descriptorField
                        objectName: "entityDescriptorField"
                        Layout.fillWidth: true
                        Layout.minimumHeight: Ui.Metrics.touch * 2
                        accessibleName: "Descriptor"
                        selectByMouse: true
                        onValuePreviewed: dialog.errorVisible = false
                        KeyNavigation.priority: KeyNavigation.BeforeItem
                        KeyNavigation.tab: voiceField.visible ? voiceField : tagsField
                        KeyNavigation.backtab: nameField
                    }
                    Ui.Text {
                        Layout.fillWidth: true
                        text: "Describe its appearance in a sentence. Every prompt that uses this entity includes this text exactly as written."
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                    }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    visible: dialog.kind === "character"
                    spacing: Ui.Metrics.xs
                    FieldLabel { text: "Voice ID (optional)" }
                    Ui.TextField {
                        id: voiceField
                        objectName: "entityVoiceField"
                        Layout.fillWidth: true
                        accessibleName: "Voice ID (optional)"
                        selectByMouse: true
                        onValuePreviewed: dialog.errorVisible = false
                        onAccepted: dialog.submit()
                    }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    FieldLabel { text: "Tags (comma-separated)" }
                    Ui.TextField {
                        id: tagsField
                        objectName: "entityTagsField"
                        Layout.fillWidth: true
                        accessibleName: "Tags (comma-separated)"
                        selectByMouse: true
                        onValuePreviewed: dialog.errorVisible = false
                        onAccepted: dialog.submit()
                    }
                }
            }
        }
        Ui.Text {
            objectName: "entitySaveReasonStacked"
            visible: !dialog.canSave && !footer.reasonFits
            Layout.fillWidth: true
            text: dialog.saveReason
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.Wrap
        }
        RowLayout {
            id: footer
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            readonly property bool reasonFits: reasonProbe.implicitWidth <= width - cancel.implicitWidth - save.implicitWidth - 2 * spacing
            Ui.Text { id: reasonProbe; visible: false; text: dialog.saveReason; role: Ui.Typography.SansCaption }
            Ui.Text {
                objectName: "entitySaveReason"
                visible: !dialog.canSave && footer.reasonFits
                Layout.fillWidth: true
                text: dialog.saveReason
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Item { visible: dialog.canSave || !footer.reasonFits; Layout.fillWidth: true }
            Ui.EditorButton {
                id: cancel
                objectName: "entityCancel"
                density: Ui.EditorButton.Compact
                text: "Cancel"
                enabled: !dialog.saving
                onClicked: dialog.close()
            }
            Ui.EditorButton {
                id: save
                objectName: "entitySave"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Primary
                text: dialog.editing ? "Save" : "Create"
                enabled: dialog.canSave
                loading: dialog.saving
                onClicked: dialog.submit()
            }
        }
    }
}

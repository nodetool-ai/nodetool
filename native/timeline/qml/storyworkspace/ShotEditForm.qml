import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "shotDraft.js" as Draft

// The shot editor's form column: what the shot shows and says, its cast, the camera, an Advanced
// fold, and the prompts a render sends. A port of web ShotEditTable and its neighbours.
// Every field writes into the editor's draft.
ColumnLayout {
    id: form
    objectName: "shotEditForm"
    required property var editor
    readonly property var draft: editor.draft || Draft.fromShot({})
    readonly property bool readOnly: editor.readOnly
    property bool advancedOpen: false
    property bool promptsOpen: false
    spacing: Ui.Metrics.lg

    component FieldLabel: Ui.Text {
        Layout.fillWidth: true
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        elide: Text.ElideRight
    }
    component SectionTitle: Ui.Text {
        Layout.fillWidth: true
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Disabled
        font.capitalization: Font.AllUppercase
        font.letterSpacing: Ui.Metrics.micro / 2
    }
    // A labelled multiline field bound to one draft key.
    component DraftArea: ColumnLayout {
        id: area
        required property string key
        required property string label
        property string placeholder: ""
        property bool focusOnOpen: false
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        FieldLabel { text: area.label }
        Ui.TextArea {
            id: input
            objectName: "shotEdit_" + area.key
            Layout.fillWidth: true
            value: form.draft[area.key] || ""
            placeholderText: area.placeholder
            accessibleName: area.label
            enabled: !form.readOnly
            onValuePreviewed: next => form.editor.setDraft(area.key, next)
            Component.onCompleted: if (area.focusOnOpen) forceActiveFocus()
        }
    }
    component DraftSelect: ColumnLayout {
        id: choice
        required property string key
        required property string label
        required property var suggestions
        Layout.fillWidth: true
        Layout.preferredWidth: 1
        spacing: Ui.Metrics.xs
        FieldLabel { text: choice.label }
        Ui.Select {
            objectName: "shotEdit_" + choice.key
            Layout.fillWidth: true
            options: Draft.cameraOptions(choice.suggestions, form.draft[choice.key] || "")
            value: form.draft[choice.key] || ""
            accessibleName: choice.label
            enabled: !form.readOnly
            onValueCommitted: next => form.editor.setDraft(choice.key, next)
        }
    }

    // What the shot shows and says.
    DraftArea { key: "action"; label: "Description"; placeholder: "Describe what happens in the shot" }
    DraftArea { key: "motion"; label: "Shot motion"; placeholder: "Describe camera or subject motion" }
    DraftArea { key: "endState"; label: "End state"; placeholder: "Describe the final state of the shot" }
    DraftArea { key: "sound"; label: "Sound"; placeholder: "Describe sound or ambience" }
    DraftArea { visible: !form.editor.linksLines; key: "dialogue"; label: "Dialogue"; placeholder: "Dialogue is managed in the script" }
    ColumnLayout {
        objectName: "shotDialogueReadonly"
        visible: form.editor.linksLines
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        FieldLabel { text: "Dialogue" }
        Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; text: form.draft.dialogue || "—" }
        Ui.EditorButton {
            objectName: "shotEditInScript"
            density: Ui.EditorButton.Compact
            text: "Edit dialogue in script"
            onClicked: form.editor.editInScript()
        }
        Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; text: "Dialogue wording is managed by the script." }
    }

    // The cast and places this shot renders with, as reference-image tiles.
    ColumnLayout {
        objectName: "shotEntities"
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        FieldLabel { text: "In this shot" }
        Ui.Text {
            Layout.fillWidth: true
            visible: form.editor.appliedEntities.length === 0
            wrapMode: Text.Wrap
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            text: "No entities yet. Choose a character, location, style, or prop to keep it consistent in this shot."
        }
        Flow {
            Layout.fillWidth: true
            visible: form.editor.appliedEntities.length > 0
            spacing: Ui.Metrics.sm
            Repeater {
                model: form.editor.appliedEntities
                delegate: Column {
                    id: tile
                    required property var modelData
                    readonly property string name: modelData.name || "Untitled entity"
                    width: Ui.Metrics.xxxl * 2.5
                    spacing: Ui.Metrics.xs
                    Rectangle {
                        width: parent.width
                        height: width
                        radius: Ui.Metrics.radiusControl
                        color: Ui.Theme.actionHover
                        border.width: Ui.Metrics.border
                        border.color: Ui.Theme.borderSubtle
                        clip: true
                        Image {
                            anchors.fill: parent
                            anchors.margins: Ui.Metrics.border
                            source: form.editor.mediaBrowser ? form.editor.mediaBrowser.thumbnails[tile.modelData.id] || "" : ""
                            fillMode: Image.PreserveAspectCrop
                            asynchronous: true
                        }
                        Ui.ToolbarIconButton {
                            objectName: "shotEntityRemove_" + tile.modelData.id
                            anchors.top: parent.top
                            anchors.right: parent.right
                            visible: !form.readOnly
                            iconName: "close"
                            text: "Remove " + tile.name + " from this shot"
                            onClicked: form.editor.toggleEntity(tile.modelData.id)
                        }
                    }
                    Ui.Text { width: parent.width; text: tile.name; role: Ui.Typography.SansCaption; elide: Text.ElideRight }
                }
            }
        }
        Ui.EditorButton {
            id: chooseEntities
            objectName: "shotChooseEntities"
            visible: !form.readOnly
            enabled: form.editor.boardEntities.length > 0
            density: Ui.EditorButton.Compact
            trailingIconName: "arrowDropDown"
            text: "Choose entities"
            disabledReason: "Add entities to the storyboard first."
            onClicked: form.entityMenu.openAt(chooseEntities)
        }
    }

    // Kept out of the layout: a popup child adds space to a ColumnLayout.
    property Ui.ContextMenu entityMenu: Ui.ContextMenu {
        Repeater {
            model: form.editor.boardEntities
            delegate: Ui.MenuItem {
                required property var modelData
                text: modelData.name || "Untitled entity"
                checkable: true
                checked: form.editor.appliedEntities.some(entity => entity.id === modelData.id)
                onTriggered: form.editor.toggleEntity(modelData.id)
            }
        }
    }
    // The camera, two fields to a row.
    SectionTitle { text: "Shot details" }
    GridLayout {
        Layout.fillWidth: true
        columns: 2
        columnSpacing: Ui.Metrics.lg
        rowSpacing: Ui.Metrics.lg
        DraftSelect { key: "framing"; label: "Shot size"; suggestions: Draft.FRAMING }
        DraftSelect { key: "lens"; label: "Focal length"; suggestions: Draft.LENS }
        DraftSelect { key: "angle"; label: "Camera angle"; suggestions: Draft.ANGLE }
        DraftSelect { key: "movement"; label: "Camera movement"; suggestions: Draft.MOVEMENT }
        DraftSelect { key: "equipment"; label: "Camera equipment"; suggestions: Draft.EQUIPMENT }
        ColumnLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: 1
            Layout.alignment: Qt.AlignTop
            spacing: Ui.Metrics.xs
            readonly property bool pinned: form.draft.durationSource === "manual"
            FieldLabel { text: "Duration (seconds)" }
            Ui.TextField {
                objectName: "shotEdit_durationSeconds"
                Layout.fillWidth: true
                value: form.draft.durationSeconds
                inputMethodHints: Qt.ImhFormattedNumbersOnly
                placeholderText: !parent.pinned && form.editor.shot && form.editor.shot.duration_source === "audio" && form.editor.shot.duration_seconds
                    ? String(form.editor.shot.duration_seconds) : "Model default"
                accessibleName: "Shot duration in seconds"
                valid: !form.editor.durationInvalid
                errorText: "Enter a valid duration."
                enabled: !form.readOnly
                onValuePreviewed: next => form.editor.draft = Draft.withDuration(form.editor.draft, next, form.editor.linksLines)
            }
            Ui.Text { visible: form.editor.durationInvalid; text: "Enter a valid duration."; role: Ui.Typography.SansCaption; tone: Ui.Text.Error }
            Ui.EditorButton {
                objectName: "shotDurationSource"
                visible: form.editor.linksLines
                density: Ui.EditorButton.Compact
                text: parent.pinned ? "Manual" : "From voice takes"
                description: parent.pinned ? "Use voice take duration" : "Set duration manually"
                enabled: !form.readOnly
                onClicked: form.editor.draft = Draft.withDurationSourceToggled(form.editor.draft)
            }
        }
    }

    // Notes, the shot's title and render mode, and graphics.
    Rectangle {
        Layout.fillWidth: true
        implicitHeight: advanced.implicitHeight + 2 * Ui.Metrics.lg
        radius: Ui.Metrics.radiusCard
        color: "transparent"
        border.width: Ui.Metrics.border
        border.color: Ui.Theme.borderSubtle
        Ui.InspectorSection {
            id: advanced
            objectName: "shotAdvanced"
            x: Ui.Metrics.lg
            y: Ui.Metrics.lg
            width: parent.width - 2 * Ui.Metrics.lg
            title: "Advanced"
            expanded: form.advancedOpen
            onExpansionRequested: next => form.advancedOpen = next
            GridLayout {
                width: parent.width
                columns: 2
                columnSpacing: Ui.Metrics.lg
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1
                    spacing: Ui.Metrics.xs
                    FieldLabel { text: "Shot title" }
                    Ui.TextField {
                        objectName: "shotEdit_slug"
                        Layout.fillWidth: true
                        value: form.draft.slug
                        placeholderText: "Enter a shot title"
                        accessibleName: "Shot title"
                        enabled: !form.readOnly
                        onValuePreviewed: next => form.editor.setDraft("slug", next)
                    }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.preferredWidth: 1
                    spacing: Ui.Metrics.xs
                    FieldLabel { text: "Render mode" }
                    Ui.Select {
                        objectName: "shotEdit_renderMode"
                        Layout.fillWidth: true
                        options: [{label: "Keyframe", value: "keyframe"}, {label: "Direct prompt", value: "direct"}, {label: "Reference image", value: "reference"}]
                        value: form.draft.renderMode
                        accessibleName: "Render mode"
                        enabled: !form.readOnly
                        onValueCommitted: next => form.editor.setDraft("renderMode", next)
                    }
                }
            }
            ColumnLayout {
                width: parent.width
                spacing: Ui.Metrics.xs
                FieldLabel { text: "Notes" }
                Ui.TextArea {
                    objectName: "shotEdit_notes"
                    width: parent.width
                    Layout.fillWidth: true
                    Layout.minimumHeight: Ui.Metrics.touch * 1.5
                    value: form.draft.notes
                    placeholderText: "Add notes for this shot"
                    accessibleName: "Notes"
                    enabled: !form.readOnly
                    onValuePreviewed: next => form.editor.setDraft("notes", next)
                }
            }
            ShotGraphicsEditor {
                width: parent.width
                shot: form.editor.shot || ({})
                graphics: form.draft.graphics
                readOnly: form.readOnly
                onGraphicsEdited: next => form.editor.setDraft("graphics", next)
            }
        }
    }

    // The prompts a render of this shot sends, as the draft would save it.
    Ui.InspectorSection {
        id: prompts
        objectName: "shotPromptPreview"
        Layout.fillWidth: true
        title: "Prompts"
        expanded: form.promptsOpen
        onExpansionRequested: next => form.promptsOpen = next
        readonly property string mode: form.editor.previewShot ? form.editor.previewShot.render_mode || "keyframe" : "keyframe"
        Repeater {
            model: form.promptsOpen && form.editor.previewShot ? [
                {label: "Still prompt", kind: "image", show: prompts.mode === "keyframe"},
                {label: "Clip prompt", kind: "video", show: true}
            ].filter(block => block.show) : []
            delegate: Column {
                id: block
                required property var modelData
                readonly property string prompt: form.editor.renders.prompt(form.editor.promptDocument, form.editor.previewShot, modelData.kind)
                width: prompts.width
                spacing: Ui.Metrics.xs
                Row {
                    spacing: Ui.Metrics.xs
                    Ui.Text { anchors.verticalCenter: parent.verticalCenter; text: block.modelData.label; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                    Ui.ToolbarIconButton {
                        iconName: "copy"
                        text: "Copy " + block.modelData.label.toLowerCase()
                        enabled: block.prompt !== ""
                        onClicked: { clipboard.text = block.prompt; clipboard.selectAll(); clipboard.copy() }
                    }
                }
                Rectangle {
                    width: parent.width
                    height: promptText.implicitHeight + 2 * Ui.Metrics.sm
                    radius: Ui.Metrics.radiusControl
                    color: Ui.Theme.actionHover
                    Ui.Text {
                        id: promptText
                        x: Ui.Metrics.sm
                        y: Ui.Metrics.sm
                        width: parent.width - 2 * Ui.Metrics.sm
                        wrapMode: Text.Wrap
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                        text: block.prompt || "Nothing to send yet."
                    }
                }
            }
        }
        Ui.Text {
            width: prompts.width
            visible: form.promptsOpen && form.editor.appliedEntities.length > 0
            wrapMode: Text.Wrap
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            readonly property var names: form.editor.appliedEntities.map(entity => entity.name || "Untitled entity")
            text: (names.length === 1 ? "Reference image for " : "Reference images for ") + names.join(", ") + (names.length === 1 ? " is" : " are") + " attached when the render starts."
        }
    }
    TextEdit { id: clipboard; visible: false }
}

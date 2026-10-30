import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
ScrollView {
    id: panel
    objectName: "storyWorkspaceEditor"
    required property var controller
    required property var workspace
    property string kind: "scripts"
    property string returnId: ""
    property string returnKind: ""
    readonly property var resource: workspace.resource
    readonly property var document: resource.document || ({})
    signal productionRequested()
    signal referenceRequested(string assetId)
    clip: true
    background: Rectangle { color: Theme.backgroundDefault }
    palette.window: Theme.backgroundPaper
    palette.windowText: Theme.textPrimary
    palette.base: Theme.backgroundDefault
    palette.text: Theme.textPrimary
    palette.button: Theme.backgroundPaper
    palette.buttonText: Theme.textPrimary
    palette.highlight: Theme.primary
    contentWidth: availableWidth
    function browse(nextKind) {
        kind = nextKind
        controller.listContextResources(kind, linked.checked)
    }
    function openResource(id, nextKind) {
        kind = nextKind
        if (kind === "scripts") controller.openScript(id)
        else controller.openStoryboard(id)
    }
    Column {
        width: panel.availableWidth - Theme.spacingMd * 2
        x: Theme.spacingMd
        property real padding: 0
        spacing: Theme.spacingMd
        Flow {
            width: parent.width - parent.padding * 2
            spacing: Theme.spacingSm
            Button { text: "Scripts"; objectName: "workspaceScripts"; enabled: !controller.busy; onClicked: panel.browse("scripts") }
            Button { text: "Storyboards"; objectName: "workspaceStoryboards"; enabled: !controller.busy; onClicked: panel.browse("storyboards") }
            Button { text: "Retry list"; enabled: !controller.busy; onClicked: panel.browse(panel.kind === "entities" ? panel.returnKind : panel.kind) }
        }
        CheckBox { id: linked; text: "Only scripts linked to this cut"; checked: true }
        Text {
            width: parent.width - parent.padding * 2
            wrapMode: Text.Wrap
            color: Theme.textSecondary
            text: "Browse this project's writing and shot direction. Save documents here, then apply to the cut in Production. Drafts stay in this session when you switch documents."
        }
        Repeater {
            model: workspace.linkedResources
            delegate: Button {
                required property var modelData
                width: parent.width - parent.padding * 2
                text: "Open linked " + (modelData.kind === "scripts" ? "script" : "storyboard")
                enabled: !controller.busy
                onClicked: panel.openResource(modelData.id, modelData.kind)
            }
        }
        BusyIndicator { running: controller.busy; visible: running }
        Text {
            width: parent.width - parent.padding * 2
            wrapMode: Text.Wrap
            color: Theme.error
            text: workspace.error || controller.error
            visible: text !== ""
            Accessible.role: Accessible.AlertMessage
        }
        Text {
            width: parent.width - parent.padding * 2
            wrapMode: Text.Wrap
            color: Theme.textSecondary
            visible: !controller.busy && !resource.id
            text: Array.isArray(controller.result) && controller.result.length === 0 ? "No documents in this context. Choose Scripts or Storyboards to retry, or create one in Production." : "Choose Scripts or Storyboards to open a document. Connect to your timeline's server to load and save it."
        }
        Repeater {
            model: Array.isArray(controller.result) ? controller.result : []
            delegate: Button {
                required property var modelData
                width: parent.width - parent.padding * 2
                text: modelData.name || modelData.id
                enabled: !controller.busy
                onClicked: panel.openResource(modelData.id, panel.kind)
            }
        }
        Text { text: resource.name || (resource.metadata || {}).nodetool_entity?.name || ""; color: Theme.textPrimary; width: parent.width - parent.padding * 2; wrapMode: Text.Wrap }
        Text { text: resource.id || ""; color: Theme.textSecondary; width: parent.width - parent.padding * 2; wrapMode: Text.WrapAnywhere }
        Flow {
            width: parent.width - parent.padding * 2
            spacing: Theme.spacingSm
            visible: !!resource.id
            Button { text: "Discard all line drafts"; visible: document.sections !== undefined && controller.scriptDirty; enabled: !controller.busy && !workspace.dirty; onClicked: { lineDiscardDialog.scriptId = resource.id; lineDiscardDialog.open() } }
            Button { text: "Save changes"; objectName: "workspaceSave"; enabled: workspace.dirty && !controller.busy; onClicked: workspace.save() }
            Button { text: "Discard draft"; enabled: workspace.dirty && !controller.busy; onClicked: discardDialog.open() }
            Button { text: "Reopen"; enabled: !controller.busy; onClicked: document.shots !== undefined ? panel.openResource(resource.id, "storyboards") : document.sections !== undefined ? panel.openResource(resource.id, "scripts") : controller.openEntity(resource.id) }
            Button { text: "Review / apply in Production"; visible: panel.kind !== "entities"; enabled: !workspace.dirty && !controller.scriptDirty && !controller.busy; onClicked: panel.productionRequested() }
            Button { objectName: "workspaceBackToDocument"; text: "Back to document"; visible: panel.kind === "entities" && panel.returnId !== ""; enabled: !controller.busy; onClicked: panel.openResource(panel.returnId, panel.returnKind) }
        }
        Text { visible: workspace.dirty; text: "Unsaved document changes"; color: Theme.warning }
        Button {
            visible: !!document.screenplay?.script_id
            text: "Open linked script"
            enabled: !controller.busy
            onClicked: panel.openResource(document.screenplay.script_id, "scripts")
        }
        Button {
            visible: !!resource.storyboardId
            text: "Open linked storyboard"
            enabled: !controller.busy
            onClicked: panel.openResource(resource.storyboardId, "storyboards")
        }
        Repeater {
            model: document.sections ? controller.scriptRows : []
            delegate: Column {
                id: line
                required property var modelData
                readonly property bool lineDirty: { controller.scriptDraftRevision; return controller.hasScriptLineDraft(modelData.scriptId || "", modelData.id || "") }
                width: parent.width - parent.padding * 2
                Text { text: line.modelData.kind === "section" ? line.modelData.title || "" : line.modelData.speakerName || ""; color: Theme.textSecondary; width: parent.width; wrapMode: Text.Wrap }
                TextArea {
                    width: parent.width
                    visible: line.modelData.kind === "line"
                    enabled: !controller.busy && !workspace.dirty
                    text: line.modelData.text || ""
                    placeholderText: "Script line"
                    Accessible.name: "Script line"
                    wrapMode: TextEdit.Wrap
                    onTextEdited: controller.setScriptLineDraft(line.modelData.scriptId, line.modelData.id, text)
                }
                Text { visible: !!line.modelData.draftOrphan; text: "This line was removed remotely. Copy its text before discarding the draft."; color: Theme.warning; width: parent.width; wrapMode: Text.Wrap }
                Button { visible: line.lineDirty; text: "Save line"; enabled: !controller.busy && !workspace.dirty && !line.modelData.draftOrphan; onClicked: controller.saveScriptLineDraft(line.modelData.scriptId, line.modelData.id) }
            }
        }
        Repeater {
            model: document.cast || []
            delegate: Column {
                id: speaker
                required property var modelData
                width: parent.width - parent.padding * 2
                Text { text: "Cast"; color: Theme.textSecondary }
                TextField { width: parent.width; text: speaker.modelData.name || ""; placeholderText: "Character name"; Accessible.name: "Character name"; enabled: !controller.busy && !controller.scriptDirty; onTextEdited: workspace.patchSpeaker(speaker.modelData.id, "name", text) }
                TextField { width: parent.width; text: speaker.modelData.entityId || ""; placeholderText: "Character entity ID"; Accessible.name: "Character entity ID"; enabled: !controller.busy && !controller.scriptDirty; onTextEdited: workspace.patchSpeaker(speaker.modelData.id, "entityId", text === "" ? null : text) }
            }
        }
        Repeater {
            model: document.shots || []
            delegate: Column {
                id: shot
                required property var modelData
                width: parent.width - parent.padding * 2
                spacing: Theme.spacingSm
                Text { text: shot.modelData.slug || shot.modelData.id; color: Theme.textPrimary; width: parent.width; wrapMode: Text.Wrap }
                Repeater {
                    model: [{key:"action",label:"Shot brief"}, {key:"dialogue",label:"Dialogue"}, {key:"motion",label:"Motion"}, {key:"sound",label:"Sound"}]
                    delegate: Column {
                        id: field
                        required property var modelData
                        width: shot.width
                        Text { text: field.modelData.label; color: Theme.textSecondary }
                        TextArea { objectName: "workspaceShot_" + field.modelData.key; width: parent.width; text: shot.modelData[field.modelData.key] || ""; wrapMode: TextEdit.Wrap; Accessible.name: field.modelData.label; enabled: !controller.busy; onTextEdited: workspace.patchShot(shot.modelData.id, field.modelData.key, text) }
                    }
                }
                Text { text: "Shot entities (JSON array of full IDs)"; color: Theme.textSecondary; width: parent.width; wrapMode: Text.Wrap }
                TextArea { width: parent.width; text: workspace.jsonDraft(shot.modelData.id, "entity_ids", shot.modelData.entity_ids || []); wrapMode: TextEdit.Wrap; enabled: !controller.busy; onTextEdited: workspace.setJsonDraft(shot.modelData.id, "entity_ids", text) }
                Text { text: "References (JSON array of media references)"; color: Theme.textSecondary; width: parent.width; wrapMode: Text.Wrap }
                TextArea { width: parent.width; text: workspace.jsonDraft(shot.modelData.id, "production.references", (shot.modelData.production || {}).references || []); wrapMode: TextEdit.Wrap; enabled: !controller.busy; onTextEdited: workspace.setJsonDraft(shot.modelData.id, "production.references", text) }
                Repeater {
                    model: (shot.modelData.production || {}).references || []
                    delegate: Button {
                        required property var modelData
                        width: shot.width
                        visible: (modelData.uri || "").indexOf("asset://") === 0
                        text: "Preview " + (modelData.name || "reference")
                        enabled: !workspace.dirty && !controller.busy
                        onClicked: panel.referenceRequested(modelData.uri.slice(8))
                    }
                }
                Text { text: "Inspect generated candidates and choose a take in Production."; color: Theme.textSecondary; width: parent.width; wrapMode: Text.Wrap }
                Button { text: "Review shot candidates"; enabled: !workspace.dirty && !controller.scriptDirty && !controller.busy; onClicked: panel.productionRequested() }
            }
        }
        Column {
            width: parent.width - parent.padding * 2
            visible: document.shots !== undefined
            Text { text: "Board entities (JSON array of full IDs)"; color: Theme.textSecondary; width: parent.width; wrapMode: Text.Wrap }
            TextArea { width: parent.width; text: workspace.jsonDraft("", "entityIds", document.entityIds || []); wrapMode: TextEdit.Wrap; enabled: !controller.busy; onTextEdited: workspace.setJsonDraft("", "entityIds", text) }
        }
        Text { visible: workspace.entityIds.length > 0; text: "Characters and associated entities"; color: Theme.textPrimary; width: parent.width - parent.padding * 2; wrapMode: Text.Wrap }
        Repeater {
            model: workspace.entityIds
            delegate: Button {
                required property string modelData
                width: parent.width - parent.padding * 2
                objectName: "workspaceInspectEntity"
                text: "Inspect " + modelData
                enabled: !controller.busy
                onClicked: { panel.returnId = resource.id; panel.returnKind = document.shots !== undefined ? "storyboards" : "scripts"; panel.kind = "entities"; controller.openEntity(modelData) }
            }
        }
        Column {
            id: entity
            property var marker: (resource.metadata || {}).nodetool_entity || ({})
            width: parent.width - parent.padding * 2
            visible: !!marker.kind
            Text { text: entity.marker.kind || ""; color: Theme.textSecondary }
            Button { text: "Preview reference image"; enabled: !workspace.dirty && !controller.busy; onClicked: panel.referenceRequested(entity.marker.reference_asset_id || resource.id) }
            Repeater {
                model: [{key:"name",label:"Name"}, {key:"descriptor",label:"Descriptor"}, {key:"description",label:"Description"}, {key:"voice_id",label:"Voice ID"}, {key:"reference_asset_id",label:"Reference image asset ID"}]
                delegate: Column {
                    id: entityField
                    required property var modelData
                    width: entity.width
                    Text { text: entityField.modelData.label; color: Theme.textSecondary }
                    TextArea { width: parent.width; text: entity.marker[entityField.modelData.key] || ""; wrapMode: TextEdit.Wrap; Accessible.name: entityField.modelData.label; enabled: !controller.busy; onTextEdited: workspace.patchEntity(entityField.modelData.key, text === "" && entityField.modelData.key === "reference_asset_id" ? null : text) }
                }
            }
        }
    }
    Dialog {
        id: lineDiscardDialog
        property string scriptId: ""
        title: "Discard all unsaved script lines?"
        modal: true
        standardButtons: Dialog.Discard | Dialog.Cancel
        onDiscarded: controller.discardScriptDrafts(scriptId)
    }
    Dialog {
        id: discardDialog
        title: "Discard this document's draft?"
        modal: true
        standardButtons: Dialog.Discard | Dialog.Cancel
        onDiscarded: workspace.discard()
    }
}

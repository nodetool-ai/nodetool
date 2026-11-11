import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import NodeTool.ModelPicker
import "../assets/AssetContext.js" as Context

ColumnLayout {
    id: root
    readonly property var pickerCatalog: catalog
    property string operationValue: "AI edit"
    property string directionValue: ""
    property var durationValue: null
    required property TimelineModel timeline
    required property ClipGestureController gestures
    required property var controller
    readonly property string clipId: gestures && gestures.selection.length === 1 ? gestures.selection[0] : ""
    readonly property var selectedClip: inspector.clip
    visible: clipId !== "" && (selectedClip.mediaType === "video" || selectedClip.mediaType === "image")
    spacing: Ui.Metrics.md
    ClipInspectorController { id: inspector; timeline: root.timeline; clipId: root.clipId }
    ModelCatalogController {
        id: catalog
        mode: root.selectedClip.mediaType === "image" ? "image_to_video" : operation.currentIndex === 1 ? "extend_video" : "video_to_video"
    }
    Connections { target: root.timeline; function onDocumentReplaced() { catalog.reload() } }
    Ui.Text { role: Ui.Typography.SansLabel; text: "Selected clip: " + (root.selectedClip.name || "Clip"); }
    Ui.Select {
        id: operation
        objectName: "clipAiOperation"
        visible: root.selectedClip.mediaType === "video"
        Layout.fillWidth: true
        options: [{label:"AI edit",value:"AI edit"},{label:"Extend",value:"Extend"}]
        value: root.operationValue
        accessibleName: "Clip operation"
        onValueCommitted: next => root.operationValue = next
    }
    Ui.Text { role: Ui.Typography.SansLabel; text: root.selectedClip.mediaType === "image" ? "Image to video" : operation.currentIndex === 1 ? "Extend" : "AI edit"; tone: Ui.Text.Secondary }
    ModelPickerButton {
        id: modelPicker
        objectName: "clipAiModel"
        Layout.fillWidth: true
        catalog: root.pickerCatalog
        Accessible.name: "Clip generation model"
        onAddProvidersRequested: {
            const dialog = Context.itemNamed(root.Window.window ? root.Window.window.contentItem : null, "providerSettingsDialog")
            if (dialog) dialog.open()
        }
    }
    Ui.Text { role: Ui.Typography.SansLabel; visible: catalog.error !== ""; text: catalog.error; tone: Ui.Text.Error; Layout.fillWidth: true; wrapMode: Text.Wrap }
    Ui.TextArea {
        id: instruction
        objectName: "clipAiInstruction"
        Layout.fillWidth: true
        Layout.preferredHeight: 80
        wrapMode: TextEdit.Wrap
        placeholderText: root.selectedClip.mediaType === "image" ? "Describe the motion" : operation.currentIndex === 1 ? "Describe the extension" : "Describe the edit"
        accessibleName: "Generation instructions"
    }
    RowLayout {
        visible: root.selectedClip.mediaType === "video" && operation.currentIndex === 1
        Ui.Text { role: Ui.Typography.SansLabel; text: "Extend from"; tone: Ui.Text.Secondary }
        Ui.Select {
            id: direction
            readonly property var tasks: catalog.selectedModel.supported_tasks || []
            readonly property bool explicitDirections: tasks.includes("extend_video_start") || tasks.includes("extend_video_end")
            readonly property var choices: explicitDirections ? [tasks.includes("extend_video_end") ? "End" : "", tasks.includes("extend_video_start") ? "Start" : ""].filter(x => x !== "") : ["End", "Start"]
            options: choices.map(choice => ({label: choice, value: choice}))
            value: choices.includes(root.directionValue) ? root.directionValue : choices[0]
            accessibleName: "Extend from"
            onValueCommitted: next => root.directionValue = next
        }
        Ui.Text { role: Ui.Typography.SansLabel; text: "Seconds"; tone: Ui.Text.Secondary }
        Ui.Select {
            id: extraDuration
            readonly property var choices: catalog.constraints.durations && catalog.constraints.durations.length ? catalog.constraints.durations : [2, 3, 5, 8]
            options: choices.map(choice => ({label: String(choice), value: choice}))
            value: choices.includes(root.durationValue) ? root.durationValue : choices.includes(3) ? 3 : choices[0]
            accessibleName: "Extension duration"
            onValueCommitted: next => root.durationValue = next
        }
    }
    Ui.EditorButton {
        objectName: "clipAiSubmit"
        text: root.selectedClip.mediaType === "image" ? "Generate video" : operation.currentIndex === 1 ? "Generate extension" : "Generate edit"
        enabled: root.controller.ready && !root.controller.busy && !inspector.locked && catalog.selectionAvailable &&
                 (root.selectedClip.mediaType === "video" && operation.currentIndex === 1 || instruction.text.trim() !== "")
        onClicked: {
            const selected = catalog.selectedModel
            const videoModel = { id: selected.id, provider: selected.provider, durations: catalog.constraints.durations || [],
                aspectRatios: catalog.constraints.aspectRatios || [], resolutions: catalog.constraints.resolutions || [],
                supportedTasks: selected.supported_tasks || [] }
            if (root.selectedClip.mediaType === "image") {
                root.controller.submitImageToVideo(root.clipId, videoModel, { prompt: instruction.text.trim() })
            } else if (operation.currentIndex === 1) {
                root.controller.submitExtension(root.clipId, videoModel, { direction: direction.value === "End" ? "end" : "start",
                    prompt: instruction.text.trim(), addedSourceDurationMs: Number(extraDuration.value) * 1000 })
            } else {
                root.controller.submitMediaEdit(root.clipId, { instruction: instruction.text.trim(), provider: selected.provider,
                    model: selected.id, resolution: (catalog.constraints.resolutions || [])[0] || root.selectedClip.resolution || "" })
            }
        }
    }
}

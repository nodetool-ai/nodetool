import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.ModelPicker
import "../assets/AssetContext.js" as Context

ColumnLayout {
    id: root
    readonly property var pickerCatalog: catalog
    required property TimelineModel timeline
    required property ClipGestureController gestures
    required property var controller
    readonly property string clipId: gestures && gestures.selection.length === 1 ? gestures.selection[0] : ""
    readonly property var selectedClip: inspector.clip
    visible: clipId !== "" && (selectedClip.mediaType === "video" || selectedClip.mediaType === "image")
    spacing: Theme.spacingMd
    ClipInspectorController { id: inspector; timeline: root.timeline; clipId: root.clipId }
    ModelCatalogController {
        id: catalog
        mode: root.selectedClip.mediaType === "image" ? "image_to_video" : operation.currentIndex === 1 ? "extend_video" : "video_to_video"
    }
    Connections { target: root.timeline; function onDocumentReplaced() { catalog.reload() } }
    Label { text: "Selected clip: " + (root.selectedClip.name || "Clip"); color: Theme.textPrimary; font.weight: Font.DemiBold }
    ComboBox {
        id: operation
        objectName: "clipAiOperation"
        visible: root.selectedClip.mediaType === "video"
        Layout.fillWidth: true
        model: ["AI edit", "Extend"]
        Accessible.name: "Clip operation"
    }
    Label { text: root.selectedClip.mediaType === "image" ? "Image to video" : operation.currentIndex === 1 ? "Extend" : "AI edit"; color: Theme.textSecondary }
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
    Label { visible: catalog.error !== ""; text: catalog.error; color: Theme.error; Layout.fillWidth: true; wrapMode: Text.Wrap }
    TextArea {
        id: instruction
        objectName: "clipAiInstruction"
        Layout.fillWidth: true
        Layout.preferredHeight: 80
        color: Theme.textPrimary
        wrapMode: TextEdit.Wrap
        placeholderText: root.selectedClip.mediaType === "image" ? "Describe the motion" : operation.currentIndex === 1 ? "Describe the extension" : "Describe the edit"
        Accessible.name: "Generation instructions"
        background: Rectangle { color: Theme.backgroundDefault; border.color: Theme.overlay; radius: Theme.radiusSm }
    }
    RowLayout {
        visible: root.selectedClip.mediaType === "video" && operation.currentIndex === 1
        Label { text: "Extend from"; color: Theme.textSecondary }
        ComboBox {
            id: direction
            readonly property var tasks: catalog.selectedModel.supported_tasks || []
            readonly property bool explicitDirections: tasks.includes("extend_video_start") || tasks.includes("extend_video_end")
            model: explicitDirections ? [tasks.includes("extend_video_end") ? "End" : "", tasks.includes("extend_video_start") ? "Start" : ""].filter(x => x !== "") : ["End", "Start"]
            Accessible.name: "Extend from"
        }
        Label { text: "Seconds"; color: Theme.textSecondary }
        ComboBox {
            id: extraDuration
            model: catalog.constraints.durations && catalog.constraints.durations.length ? catalog.constraints.durations : [2, 3, 5, 8]
            currentIndex: { const index = model.indexOf(3); return index < 0 ? 0 : index }
            Accessible.name: "Extension duration"
        }
    }
    Button {
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
                root.controller.submitExtension(root.clipId, videoModel, { direction: direction.currentText === "End" ? "end" : "start",
                    prompt: instruction.text.trim(), addedSourceDurationMs: Number(extraDuration.currentText) * 1000 })
            } else {
                root.controller.submitMediaEdit(root.clipId, { instruction: instruction.text.trim(), provider: selected.provider,
                    model: selected.id, resolution: (catalog.constraints.resolutions || [])[0] || root.selectedClip.resolution || "" })
            }
        }
    }
}

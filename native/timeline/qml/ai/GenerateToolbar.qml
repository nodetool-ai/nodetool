// nt-panel: slot=toolbar id=aiGenerate order=90 title="Generate"
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import "../Tracks" as Tracks

Item {
    id: root
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property bool compact: false
    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    property var referenceIds: []
    property string previewClipId: ""
    property string previewTakeId: ""
    property url previewUrl: ""
    AssetBrowser { id: referenceBrowser; timeline: root.timeline }
    EntityReferenceController { id: entities }
    ModelCatalogController {
        id: catalog
        mode: mode.currentIndex === 0 ? "video" : mode.currentIndex === 1 ? "audio" : "music"
    }
    property alias generationController: generation
    property var registeredGestures: null
    function registerHost() {
        if (registeredGestures) AiHostRegistry.unregisterHost(registeredGestures, root)
        registeredGestures = gestures
        if (registeredGestures) AiHostRegistry.registerHost(registeredGestures, root)
    }
    function openReview() {
        generation.open()
        dialog.open()
    }
    Component.onCompleted: registerHost()
    Component.onDestruction: if (registeredGestures) AiHostRegistry.unregisterHost(registeredGestures, root)
    onGesturesChanged: registerHost()
    GenerationController {
        id: generation
        objectName: "generationController"
        timeline: root.timeline
        onClipInserted: clipId => {
            if (root.gestures) root.gestures.selection = [clipId]
        }
    }
    Connections {
        target: generation.previewTimeline
        function onTimelineChanged() {
            if (root.previewTakeId !== "") root.previewUrl = generation.previewUrl(root.previewClipId, root.previewTakeId)
        }
    }
    Connections {
        target: root.gestures ? root.gestures.clock : null
        function onPlayingChanged() {
            if (root.gestures.clock.playing && generation.previewClock.playing) generation.stopPreview()
        }
    }
    Tracks.ToolButton {
        id: button
        objectName: "generateButton"
        label: "Generate"
        compact: root.compact
        iconPath: "M12 2l1.9 5.8L20 10l-6.1 2.2L12 18l-1.9-5.8L4 10l6.1-2.2L12 2zm7 12 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14z"
        onClicked: {
            root.openReview()
        }
    }
    Dialog {
        id: entityPicker
        objectName: "entityPicker"
        parent: Overlay.overlay
        anchors.centerIn: parent
        width: Math.min(480, (parent ? parent.width : 0) - 2 * Theme.spacingXl)
        height: Math.min(500, (parent ? parent.height : 0) - 2 * Theme.spacingXl)
        modal: true
        title: "Choose entities"
        background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusMd }
        contentItem: ColumnLayout {
            Label { visible: entities.error !== ""; text: entities.error; color: Theme.error; Layout.fillWidth: true; wrapMode: Text.Wrap }
            Label { visible: !entities.loading && entities.entities.length === 0; text: "No entities available."; color: Theme.textSecondary }
            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: entities.entities
                delegate: ItemDelegate {
                    required property var modelData
                    width: ListView.view.width
                    text: (entities.selectedIds.includes(modelData.id) ? "✓ " : "") + (modelData.name || modelData.id)
                    onClicked: entities.toggleEntity(modelData.id)
                }
            }
        }
        footer: DialogButtonBox {
            Button { text: "Done"; DialogButtonBox.buttonRole: DialogButtonBox.AcceptRole }
            onAccepted: entityPicker.close()
        }
    }
    Dialog {
        id: referencePicker
        objectName: "referencePicker"
        parent: Overlay.overlay
        anchors.centerIn: parent
        width: Math.min(480, (parent ? parent.width : 0) - 2 * Theme.spacingXl)
        height: Math.min(500, (parent ? parent.height : 0) - 2 * Theme.spacingXl)
        modal: true
        title: "Choose reference images"
        background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusMd }
        contentItem: ColumnLayout {
            Button { text: "Up"; visible: referenceBrowser.folderId !== ""; onClicked: referenceBrowser.goUp() }
            Label { visible: referenceBrowser.error !== ""; text: referenceBrowser.error; color: Theme.error; Layout.fillWidth: true; wrapMode: Text.Wrap }
            Label { visible: !referenceBrowser.busy && referenceBrowser.assets.length === 0; text: "No assets in this folder."; color: Theme.textSecondary }
            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: referenceBrowser.assets
                delegate: ItemDelegate {
                    required property var modelData
                    width: ListView.view.width
                    visible: modelData.content_type === "folder" || String(modelData.content_type || "").startsWith("image/")
                    height: visible ? implicitHeight : 0
                    text: (modelData.content_type === "folder" ? "Folder: " : root.referenceIds.includes(modelData.id) ? "✓ " : "") + (modelData.name || modelData.id)
                    onClicked: {
                        if (modelData.content_type === "folder") referenceBrowser.openFolder(modelData.id)
                        else if (root.referenceIds.includes(modelData.id)) root.referenceIds = root.referenceIds.filter(id => id !== modelData.id)
                        else root.referenceIds = [...root.referenceIds, modelData.id]
                    }
                }
            }
        }
        footer: DialogButtonBox {
            Button { text: "Done"; DialogButtonBox.buttonRole: DialogButtonBox.AcceptRole }
            onAccepted: referencePicker.close()
        }
    }
    Dialog {
        id: dialog
        objectName: "generateDialog"
        parent: Overlay.overlay
        anchors.centerIn: parent
        width: Math.min(580, (parent ? parent.width : 0) - 2 * Theme.spacingXl)
        height: Math.min(720, (parent ? parent.height : 0) - 2 * Theme.spacingXl)
        modal: true
        focus: true
        title: "Generate"
        closePolicy: Popup.CloseOnEscape
        onClosed: generation.stopPreview()
        padding: Theme.spacingXl
        background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusMd }

        contentItem: ScrollView {
            clip: true
            contentWidth: availableWidth
            ColumnLayout {
                width: dialog.availableWidth
                spacing: Theme.spacingMd
                WorkflowClip { timeline: root.timeline; gestures: root.gestures; controller: generation; Layout.fillWidth: true }
                RegenerateClip { timeline: root.timeline; gestures: root.gestures; controller: generation; Layout.fillWidth: true }
                LineDelivery { timeline: root.timeline; gestures: root.gestures; controller: generation; Layout.fillWidth: true }
                ClipOperations { timeline: root.timeline; gestures: root.gestures; controller: generation; Layout.fillWidth: true }
                Label { text: "New clip"; color: Theme.textPrimary; font.weight: Font.DemiBold }
                Label { text: "Media"; color: Theme.textSecondary }
                ComboBox {
                    id: mode
                    objectName: "generationMode"
                    Layout.fillWidth: true
                    model: ["Video", "Speech", "Music"]
                    Accessible.name: "Media type"
                }
                Label { text: mode.currentIndex === 1 ? "Text" : "Prompt"; color: Theme.textSecondary }
                TextArea {
                    id: prompt
                    objectName: "generationPrompt"
                    Layout.fillWidth: true
                    Layout.preferredHeight: 100
                    wrapMode: TextEdit.Wrap
                    color: Theme.textPrimary
                    selectByMouse: true
                    placeholderText: mode.currentIndex === 1 ? "What should the voice say?" : "Describe what to generate"
                    Accessible.name: mode.currentIndex === 1 ? "Speech text" : "Prompt"
                    background: Rectangle { color: Theme.backgroundDefault; border.color: Theme.overlay; radius: Theme.radiusSm }
                }
                Label { text: "Model"; color: Theme.textSecondary }
                ComboBox {
                    id: modelPicker
                    objectName: "generationModel"
                    Layout.fillWidth: true
                    model: catalog.models
                    textRole: "name"
                    currentIndex: {
                        for (let i = 0; i < catalog.models.length; ++i)
                            if (catalog.models[i].id === catalog.selectedModelId && catalog.models[i].provider === catalog.selectedProvider) return i
                        return -1
                    }
                    displayText: currentIndex < 0 ? (catalog.loading ? "Loading models…" : "Select model") : currentText
                    Accessible.name: "Model"
                    onActivated: index => catalog.selectModel(catalog.models[index].id, catalog.models[index].provider)
                }
                Label { visible: catalog.error !== ""; text: catalog.error; color: Theme.error; Layout.fillWidth: true; wrapMode: Text.Wrap }
                RowLayout {
                    Layout.fillWidth: true
                    visible: mode.currentIndex !== 1
                    Label { text: "Duration (seconds)"; color: Theme.textSecondary }
                    ComboBox {
                        id: duration
                        objectName: "generationDuration"
                        model: mode.currentIndex === 2 ? [15, 30, 60, 120] :
                            catalog.constraints.durations && catalog.constraints.durations.length ? catalog.constraints.durations : [2, 3, 4, 5, 6, 8, 10, 12, 15]
                        currentIndex: {
                            const preferred = mode.currentIndex === 2 ? 30 : 4
                            const found = model.indexOf(preferred)
                            return found >= 0 ? found : 0
                        }
                        Accessible.name: "Duration in seconds"
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    visible: mode.currentIndex === 0
                    Label { text: "Aspect ratio"; color: Theme.textSecondary }
                    ComboBox {
                        id: aspect
                        objectName: "generationAspect"
                        model: catalog.constraints.aspectRatios && catalog.constraints.aspectRatios.length ? catalog.constraints.aspectRatios : ["21:9", "16:9", "4:3", "1:1", "9:16", "3:4"]
                        currentIndex: { const found = model.indexOf("16:9"); return found >= 0 ? found : 0 }
                        Accessible.name: "Aspect ratio"
                    }
                    Label { text: "Resolution"; color: Theme.textSecondary }
                    ComboBox {
                        id: resolution
                        objectName: "generationResolution"
                        model: catalog.constraints.resolutions && catalog.constraints.resolutions.length ? catalog.constraints.resolutions : ["720p", "1080p", "1440p", "4K"]
                        currentIndex: { const found = model.indexOf("720p"); return found >= 0 ? found : 0 }
                        Accessible.name: "Resolution"
                    }
                }
                Label { visible: mode.currentIndex === 1; text: "Voice"; color: Theme.textSecondary }
                ComboBox {
                    id: voice
                    objectName: "generationVoice"
                    visible: mode.currentIndex === 1
                    Layout.fillWidth: true
                    model: catalog.constraints.voices || []
                    Accessible.name: "Voice"
                }
                Label { visible: mode.currentIndex === 0; text: "References"; color: Theme.textSecondary }
                RowLayout {
                    visible: mode.currentIndex === 0
                    Layout.fillWidth: true
                    Button {
                        objectName: "pickGenerationReferences"
                        text: "Add image"
                        onClicked: { referenceBrowser.refresh(); referencePicker.open() }
                    }
                    Label { text: root.referenceIds.length + " selected"; color: Theme.textSecondary }
                    Button { text: "Clear"; visible: root.referenceIds.length > 0; onClicked: root.referenceIds = [] }
                }
                RowLayout {
                    visible: mode.currentIndex === 0
                    Layout.fillWidth: true
                    Button { objectName: "pickGenerationEntities"; text: "Add entity"; onClicked: { entities.reload(); entityPicker.open() } }
                    Label { text: entities.selectedIds.length + " selected"; color: Theme.textSecondary }
                    Button { text: "Clear"; visible: entities.selectedIds.length > 0; onClicked: entities.clear() }
                }
                Label {
                    objectName: "generationStatus"
                    Layout.fillWidth: true
                    text: ({ pending: "Queued", queued: "Queued", running: "Generating…", recovering: "Checking generation status…", cancelling: "Cancelling…", completed: "Completed", failed: "Failed", cancelled: "Cancelled", needs_attention: "Needs attention", interrupted: "Interrupted" })[generation.state] || ""
                    color: Theme.textSecondary
                    wrapMode: Text.Wrap
                }
                Label {
                    objectName: "generationError"
                    Layout.fillWidth: true
                    visible: generation.error !== ""
                    text: generation.error
                    color: Theme.error
                    wrapMode: Text.Wrap
                }
                RowLayout {
                    Layout.fillWidth: true
                    Button {
                        objectName: "generationSubmit"
                        text: "Generate"
                        enabled: generation.ready && !generation.busy && prompt.text.trim() !== "" && catalog.selectedProvider !== "" && catalog.selectedModelId !== ""
                        onClicked: {
                            const start = root.gestures && root.gestures.clock ? root.gestures.clock.time : 0
                            generation.submit(mode.currentIndex === 0 ? "video" : mode.currentIndex === 1 ? "audio" : "music",
                                catalog.selectedProvider, catalog.selectedModelId, prompt.text.trim(), mode.currentIndex === 1 ? 4 : Number(duration.currentText),
                                aspect.currentText, resolution.currentText, voice.currentText, root.referenceIds, start, entities.selectedIds)
                        }
                    }
                    Button { objectName: "generationCancel"; text: "Cancel generation"; visible: generation.busy; onClicked: generation.cancel() }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    visible: root.previewTakeId !== ""
                    Label { text: root.previewUrl.toString() === "" ? "Loading preview…" : "Preview"; color: Theme.textSecondary }
                    PreviewCompositor {
                        objectName: "generationPreview"
                        Layout.fillWidth: true
                        Layout.preferredHeight: 220
                        visible: root.previewUrl.toString() !== ""
                        timeline: generation.previewTimeline
                        clock: generation.previewClock
                    }
                    FrameAnimation { running: dialog.visible && generation.previewClock.playing; onTriggered: generation.previewClock.tick() }
                    RowLayout {
                        visible: root.previewUrl.toString() !== ""
                        Button {
                            objectName: "generationPreviewPlay"
                            text: generation.previewClock.playing ? "Pause" : "Play"
                            onClicked: {
                                if (!generation.previewClock.playing && root.gestures && root.gestures.clock) root.gestures.clock.pause()
                                generation.playPreview()
                            }
                        }
                        Slider { Layout.fillWidth: true; from: 0; to: Math.max(1, generation.previewTimeline.contentEndMs); value: generation.previewClock.time; onMoved: generation.previewClock.seek(value); Accessible.name: "Preview time" }
                    }
                }
                Label { visible: generation.candidates.length > 0; text: "Review takes"; color: Theme.textPrimary; font.weight: Font.DemiBold }
                Repeater {
                    model: generation.candidates
                    delegate: ColumnLayout {
                        id: takeRow
                        required property var modelData
                        Layout.fillWidth: true
                        RowLayout {
                            Layout.fillWidth: true
                            TextField {
                                id: takeLabel
                                objectName: "generationTakeLabel"
                                Layout.fillWidth: true
                                text: takeRow.modelData.label || "Take"
                                color: Theme.textPrimary
                                Accessible.name: "Take name"
                            }
                            Button { objectName: "renameGenerationTake"; text: "Rename"; enabled: !!takeRow.modelData.recorded && !takeRow.modelData.clipMissing; onClicked: generation.renameTake(takeRow.modelData.clipId, takeRow.modelData.id, takeLabel.text) }
                        }
                        RowLayout {
                            Button {
                                objectName: "previewGenerationTake"
                                text: "Preview"
                                enabled: takeRow.modelData.status === "success" && !takeRow.modelData.clipMissing
                                onClicked: {
                                    generation.stopPreview()
                                    root.previewClipId = takeRow.modelData.clipId
                                    root.previewTakeId = takeRow.modelData.id
                                    root.previewUrl = generation.previewUrl(root.previewClipId, root.previewTakeId)
                                }
                            }
                            ComboBox {
                                id: extensionTiming
                                visible: takeRow.modelData.operation === "extension" || takeRow.modelData.source === "extended"
                                model: ["Keep cut", "Available space", "Ripple"]
                                Accessible.name: "Extension timing"
                            }
                            Button {
                                objectName: "applyGenerationTake"
                                text: "Apply"
                                enabled: takeRow.modelData.status === "success" && !takeRow.modelData.clipMissing && root.previewClipId === takeRow.modelData.clipId
                                         && root.previewTakeId === takeRow.modelData.id && root.previewUrl.toString() !== ""
                                onClicked: {
                                    if (extensionTiming.visible) generation.applyExtension(takeRow.modelData.clipId, takeRow.modelData.id,
                                        ["keep-cut", "available-space", "ripple"][extensionTiming.currentIndex])
                                    else generation.apply(takeRow.modelData.clipId, takeRow.modelData.id)
                                }
                            }
                            Button { text: "Delete"; enabled: !takeRow.modelData.recorded || !takeRow.modelData.clipMissing; onClicked: generation.deleteTake(takeRow.modelData.clipId, takeRow.modelData.id) }
                            Button { objectName: "restoreGenerationClip"; text: "Restore clip"; visible: !!takeRow.modelData.clipMissing; onClicked: generation.restoreClip(takeRow.modelData.clipId) }
                        }
                    }
                }
            }
        }
        footer: DialogButtonBox {
            Button { text: "Close"; DialogButtonBox.buttonRole: DialogButtonBox.RejectRole }
            onRejected: dialog.close()
        }
    }
}

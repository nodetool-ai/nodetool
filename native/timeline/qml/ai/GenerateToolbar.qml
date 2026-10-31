// nt-panel: slot=toolbar id=aiGenerate order=90 title="Generate"
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import NodeTool.ModelPicker
import "../Tracks" as Tracks
import "../assets/AssetContext.js" as Context

Item {
    id: root
    readonly property var pickerCatalog: catalog
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property bool compact: false
    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    property string mediaMode: "Video"
    property var durationValue: null
    property string aspectValue: ""
    property string resolutionValue: ""
    property string voiceValue: ""
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
    Connections { target: root.timeline; function onDocumentReplaced() { catalog.reload() } }
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
    Ui.ToolbarIconButton {
        id: button
        objectName: "generateButton"
        text: root.compact ? "" : "Generate"
        accessibleName: "Generate"
        display: root.compact ? AbstractButton.IconOnly : AbstractButton.TextBesideIcon
        iconName: "autoAwesome"
        onClicked: {
            root.openReview()
        }
    }
    Ui.Dialog {
        id: entityPicker
        objectName: "entityPicker"
        width: Math.min(480, (parent ? parent.width : 0) - 2 * Ui.Metrics.xl)
        height: Math.min(500, (parent ? parent.height : 0) - 2 * Ui.Metrics.xl)
        modal: true
        title: "Choose entities"
        returnFocusTo: pickEntities
        ColumnLayout {
            anchors.fill: parent
            Ui.Text { role: Ui.Typography.SansLabel; visible: entities.error !== ""; text: entities.error; tone: Ui.Text.Error; Layout.fillWidth: true; wrapMode: Text.Wrap }
            Ui.Text { role: Ui.Typography.SansLabel; visible: !entities.loading && entities.entities.length === 0; text: "No entities available."; tone: Ui.Text.Secondary }
            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: entities.entities
                delegate: Ui.EditorButton {
                    variant: Ui.EditorButton.Flat
                    contentAlignment: Qt.AlignLeft
                    required property var modelData
                    width: ListView.view.width
                    text: (entities.selectedIds.includes(modelData.id) ? "✓ " : "") + (modelData.name || modelData.id)
                    onClicked: entities.toggleEntity(modelData.id)
                }
            }
            Ui.EditorButton { text: "Done"; onClicked: entityPicker.close() }
        }
    }
    Ui.Dialog {
        id: referencePicker
        objectName: "referencePicker"
        width: Math.min(480, (parent ? parent.width : 0) - 2 * Ui.Metrics.xl)
        height: Math.min(500, (parent ? parent.height : 0) - 2 * Ui.Metrics.xl)
        modal: true
        title: "Choose reference images"
        returnFocusTo: pickReferences
        ColumnLayout {
            anchors.fill: parent
            Ui.EditorButton { text: "Up"; visible: referenceBrowser.folderId !== ""; onClicked: referenceBrowser.goUp() }
            Ui.Text { role: Ui.Typography.SansLabel; visible: referenceBrowser.error !== ""; text: referenceBrowser.error; tone: Ui.Text.Error; Layout.fillWidth: true; wrapMode: Text.Wrap }
            Ui.Text { role: Ui.Typography.SansLabel; visible: !referenceBrowser.busy && referenceBrowser.assets.length === 0; text: "No assets in this folder."; tone: Ui.Text.Secondary }
            ListView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                model: referenceBrowser.assets
                delegate: Ui.EditorButton {
                    variant: Ui.EditorButton.Flat
                    contentAlignment: Qt.AlignLeft
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
            Ui.EditorButton { text: "Done"; onClicked: referencePicker.close() }
        }
    }
    Ui.Dialog {
        id: dialog
        objectName: "generateDialog"
        width: Math.min(580, (parent ? parent.width : 0) - 2 * Ui.Metrics.xl)
        height: Math.min(720, (parent ? parent.height : 0) - 2 * Ui.Metrics.xl)
        modal: true
        focus: true
        title: "Generate"
        returnFocusTo: button
        closePolicy: Popup.CloseOnEscape
        onClosed: generation.stopPreview()

        ScrollView {
            anchors.fill: parent
            clip: true
            contentWidth: availableWidth
            ColumnLayout {
                width: dialog.availableWidth
                spacing: Ui.Metrics.md
                WorkflowClip { timeline: root.timeline; gestures: root.gestures; controller: generation; Layout.fillWidth: true }
                RegenerateClip { timeline: root.timeline; gestures: root.gestures; controller: generation; Layout.fillWidth: true }
                LineDelivery { timeline: root.timeline; gestures: root.gestures; controller: generation; Layout.fillWidth: true }
                ClipOperations { timeline: root.timeline; gestures: root.gestures; controller: generation; Layout.fillWidth: true }
                Ui.Text { role: Ui.Typography.SansLabel; text: "New clip"; }
                Ui.Text { role: Ui.Typography.SansLabel; text: "Media"; tone: Ui.Text.Secondary }
                Ui.Select {
                    id: mode
                    objectName: "generationMode"
                    Layout.fillWidth: true
                    options: ["Video", "Speech", "Music"].map(choice => ({label: choice, value: choice}))
                    value: root.mediaMode
                    accessibleName: "Media type"
                    onValueCommitted: next => root.mediaMode = next
                }
                Ui.Text { role: Ui.Typography.SansLabel; text: mode.currentIndex === 1 ? "Text" : "Prompt"; tone: Ui.Text.Secondary }
                Ui.TextArea {
                    id: prompt
                    objectName: "generationPrompt"
                    Layout.fillWidth: true
                    Layout.preferredHeight: 100
                    wrapMode: TextEdit.Wrap
                    selectByMouse: true
                    placeholderText: mode.currentIndex === 1 ? "What should the voice say?" : "Describe what to generate"
                    accessibleName: mode.currentIndex === 1 ? "Speech text" : "Prompt"
                }
                Ui.Text { role: Ui.Typography.SansLabel; text: "Model"; tone: Ui.Text.Secondary }
                ModelPickerButton {
                    id: modelPicker
                    objectName: "generationModel"
                    Layout.fillWidth: true
                    catalog: root.pickerCatalog
                    Accessible.name: "Model"
                    onAddProvidersRequested: {
                        const dialog = Context.itemNamed(root.Window.window ? root.Window.window.contentItem : null, "providerSettingsDialog")
                        if (dialog) dialog.open()
                    }
                }
                Ui.Text { role: Ui.Typography.SansLabel; visible: catalog.error !== ""; text: catalog.error; tone: Ui.Text.Error; Layout.fillWidth: true; wrapMode: Text.Wrap }
                RowLayout {
                    Layout.fillWidth: true
                    visible: mode.currentIndex !== 1
                    Ui.Text { role: Ui.Typography.SansLabel; text: "Duration (seconds)"; tone: Ui.Text.Secondary }
                    Ui.Select {
                        id: duration
                        objectName: "generationDuration"
                        readonly property var choices: mode.currentIndex === 2 ? [15, 30, 60, 120] :
                            catalog.constraints.durations && catalog.constraints.durations.length ? catalog.constraints.durations : [2, 3, 4, 5, 6, 8, 10, 12, 15]
                        options: choices.map(choice => ({label:String(choice),value:choice}))
                        value: choices.includes(root.durationValue) ? root.durationValue : choices.includes(mode.currentIndex === 2 ? 30 : 4) ? (mode.currentIndex === 2 ? 30 : 4) : choices[0]
                        onChoicesChanged: root.durationValue = null
                        accessibleName: "Duration in seconds"
                        onValueCommitted: next => root.durationValue = next
                    }
                }
                RowLayout {
                    Layout.fillWidth: true
                    visible: mode.currentIndex === 0
                    Ui.Text { role: Ui.Typography.SansLabel; text: "Aspect ratio"; tone: Ui.Text.Secondary }
                    Ui.Select {
                        id: aspect
                        objectName: "generationAspect"
                        readonly property var choices: catalog.constraints.aspectRatios && catalog.constraints.aspectRatios.length ? catalog.constraints.aspectRatios : ["21:9", "16:9", "4:3", "1:1", "9:16", "3:4"]
                        options: choices.map(choice => ({label:String(choice),value:choice}))
                        value: choices.includes(root.aspectValue) ? root.aspectValue : choices.includes("16:9") ? "16:9" : choices[0]
                        onChoicesChanged: root.aspectValue = ""
                        accessibleName: "Aspect ratio"
                        onValueCommitted: next => root.aspectValue = next
                    }
                    Ui.Text { role: Ui.Typography.SansLabel; text: "Resolution"; tone: Ui.Text.Secondary }
                    Ui.Select {
                        id: resolution
                        objectName: "generationResolution"
                        readonly property var choices: catalog.constraints.resolutions && catalog.constraints.resolutions.length ? catalog.constraints.resolutions : ["720p", "1080p", "1440p", "4K"]
                        options: choices.map(choice => ({label:String(choice),value:choice}))
                        value: choices.includes(root.resolutionValue) ? root.resolutionValue : choices.includes("720p") ? "720p" : choices[0]
                        onChoicesChanged: root.resolutionValue = ""
                        accessibleName: "Resolution"
                        onValueCommitted: next => root.resolutionValue = next
                    }
                }
                Ui.Text { role: Ui.Typography.SansLabel; visible: mode.currentIndex === 1; text: "Voice"; tone: Ui.Text.Secondary }
                Ui.Select {
                    id: voice
                    objectName: "generationVoice"
                    visible: mode.currentIndex === 1
                    Layout.fillWidth: true
                    readonly property var choices: catalog.constraints.voices || []
                    options: choices.map(choice => ({label:String(choice),value:choice}))
                    value: choices.includes(root.voiceValue) ? root.voiceValue : choices[0]
                    accessibleName: "Voice"
                    onValueCommitted: next => root.voiceValue = next
                }
                Ui.Text { role: Ui.Typography.SansLabel; visible: mode.currentIndex === 0; text: "References"; tone: Ui.Text.Secondary }
                RowLayout {
                    visible: mode.currentIndex === 0
                    Layout.fillWidth: true
                    Ui.EditorButton {
                        id: pickReferences
                        objectName: "pickGenerationReferences"
                        text: "Add image"
                        onClicked: { referenceBrowser.refresh(); referencePicker.open() }
                    }
                    Ui.Text { role: Ui.Typography.SansLabel; text: root.referenceIds.length + " selected"; tone: Ui.Text.Secondary }
                    Ui.EditorButton { text: "Clear"; visible: root.referenceIds.length > 0; onClicked: root.referenceIds = [] }
                }
                RowLayout {
                    visible: mode.currentIndex === 0
                    Layout.fillWidth: true
                    Ui.EditorButton { id: pickEntities; objectName: "pickGenerationEntities"; text: "Add entity"; onClicked: { entities.reload(); entityPicker.open() } }
                    Ui.Text { role: Ui.Typography.SansLabel; text: entities.selectedIds.length + " selected"; tone: Ui.Text.Secondary }
                    Ui.EditorButton { text: "Clear"; visible: entities.selectedIds.length > 0; onClicked: entities.clear() }
                }
                Ui.Text {
                    role: Ui.Typography.SansLabel
                    objectName: "generationStatus"
                    Layout.fillWidth: true
                    text: ({ pending: "Queued", queued: "Queued", running: "Generating…", recovering: "Checking generation status…", cancelling: "Cancelling…", completed: "Completed", failed: "Failed", cancelled: "Cancelled", needs_attention: "Needs attention", interrupted: "Interrupted" })[generation.state] || ""
                    tone: Ui.Text.Secondary
                    wrapMode: Text.Wrap
                }
                Ui.Text { role: Ui.Typography.SansLabel;
                    objectName: "generationError"
                    Layout.fillWidth: true
                    visible: generation.error !== ""
                    text: generation.error
                    tone: Ui.Text.Error
                    wrapMode: Text.Wrap
                }
                RowLayout {
                    Layout.fillWidth: true
                    Ui.EditorButton {
                        objectName: "generationSubmit"
                        text: "Generate"
                        enabled: generation.ready && !generation.busy && prompt.text.trim() !== "" && catalog.selectionAvailable
                        onClicked: {
                            const start = root.gestures && root.gestures.clock ? root.gestures.clock.time : 0
                            generation.submit(mode.currentIndex === 0 ? "video" : mode.currentIndex === 1 ? "audio" : "music",
                                catalog.selectedProvider, catalog.selectedModelId, prompt.text.trim(), mode.currentIndex === 1 ? 4 : Number(duration.currentText),
                                aspect.currentText, resolution.currentText, voice.currentText, root.referenceIds, start, entities.selectedIds)
                        }
                    }
                    Ui.EditorButton { objectName: "generationCancel"; text: "Cancel generation"; visible: generation.busy; onClicked: generation.cancel() }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    visible: root.previewTakeId !== ""
                    Ui.Text { role: Ui.Typography.SansLabel; text: root.previewUrl.toString() === "" ? "Loading preview…" : "Preview"; tone: Ui.Text.Secondary }
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
                        Ui.EditorButton {
                            objectName: "generationPreviewPlay"
                            text: generation.previewClock.playing ? "Pause" : "Play"
                            onClicked: {
                                if (!generation.previewClock.playing && root.gestures && root.gestures.clock) root.gestures.clock.pause()
                                generation.playPreview()
                            }
                        }
                        Ui.Slider { Layout.fillWidth: true; from: 0; to: Math.max(1, generation.previewTimeline.contentEndMs); value: generation.previewClock.time; onValuePreviewed: next => generation.previewClock.seek(next); accessibleName: "Preview time" }
                    }
                }
                Ui.Text { role: Ui.Typography.SansLabel; visible: generation.candidates.length > 0; text: "Review takes"; }
                Repeater {
                    model: generation.candidates
                    delegate: ColumnLayout {
                        id: takeRow
                        required property var modelData
                        Layout.fillWidth: true
                        RowLayout {
                            Layout.fillWidth: true
                            Ui.TextField {
                                id: takeLabel
                                objectName: "generationTakeLabel"
                                Layout.fillWidth: true
                                value: takeRow.modelData.label || "Take"
                                            accessibleName: "Take name"
                            }
                            Ui.EditorButton { objectName: "renameGenerationTake"; text: "Rename"; enabled: !!takeRow.modelData.recorded && !takeRow.modelData.clipMissing; onClicked: generation.renameTake(takeRow.modelData.clipId, takeRow.modelData.id, takeLabel.text) }
                        }
                        RowLayout {
                            Ui.EditorButton {
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
                            Ui.Select {
                                id: extensionTiming
                                property string selectedTiming: "Keep cut"
                                visible: takeRow.modelData.operation === "extension" || takeRow.modelData.source === "extended"
                                options: ["Keep cut", "Available space", "Ripple"].map(choice => ({label:choice,value:choice}))
                                value: selectedTiming
                                accessibleName: "Extension timing"
                                onValueCommitted: next => selectedTiming = next
                            }
                            Ui.EditorButton {
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
                            Ui.EditorButton { text: "Delete"; enabled: !takeRow.modelData.recorded || !takeRow.modelData.clipMissing; onClicked: generation.deleteTake(takeRow.modelData.clipId, takeRow.modelData.id) }
                            Ui.EditorButton { objectName: "restoreGenerationClip"; text: "Restore clip"; visible: !!takeRow.modelData.clipMissing; onClicked: generation.restoreClip(takeRow.modelData.clipId) }
                        }
                    }
                }
                Ui.EditorButton { text: "Close"; onClicked: dialog.close() }
            }
        }
    }
}

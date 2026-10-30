import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "../assets/AssetContext.js" as Context
Rectangle {
    id: panel
    objectName: "timelineScriptPanel"
    color: Theme.backgroundDefault
    property alias documentController: controller
    property bool workspaceMode: false
    property var timeline: null
    property var clock: null
    property string documentKind: "scripts"
    property string reviewedShotId: ""
    property string reviewedShotKind: "video"
    AssistController { id: controller; objectName: "timelineScriptController"; timeline: panel.timeline; documentOnly: panel.workspaceMode }
    ScriptVoicing {
        id: voicing
        timeline: panel.timeline
        onSaved: scriptId => { if (panel.workspaceMode) controller.openScript(scriptId); else controller.applyScriptRevision(scriptId) }
    }
    BeatVoicing { id: beatVoicing; timeline: panel.timeline }
    ModelCatalogController { id: voiceCatalog; mode: "audio" }
    ProductionReview {
        id: production
        objectName: "timelineProductionReview"
        timeline: panel.timeline
        onPlaced: clipId => {
            const editor = Context.editorFor(panel)
            const tracks = Context.itemNamed(editor, "tracksRegion")
            if (tracks) tracks.gestures.selection = [clipId]
        }
    }
    ShotWorkflow { id: shots; timeline: panel.timeline; onSaved: board => controller.updateResource(board) }
    ModelCatalogController { id: shotCatalog; mode: shotKind.currentIndex === 1 ? "image" : shotTask.currentIndex === 1 ? "image_to_video" : shotTask.currentIndex === 2 ? "reference_to_video" : "video" }
    CandidatePreview { id: review; timeline: panel.timeline }
    TranscriptRequest { id: transcription; timeline: panel.timeline }
    Timer { interval: 3000; repeat: true; running: !panel.workspaceMode && panel.timeline !== null && !voicing.busy && !beatVoicing.busy && !controller.busy; onTriggered: controller.refreshLinkedScript() }
    Component.onCompleted: Qt.callLater(() => {
        const editor = Context.editorFor(panel)
        panel.timeline = editor ? editor.timeline : null
        panel.clock = editor ? editor.clock : null
    })
    function previewReference(assetId) { review.preview(assetId, "image", 4000) }
    function selectedModelIndex(catalog) {
        for (let i = 0; i < catalog.models.length; ++i) {
            const model = catalog.models[i]
            if (model.id === catalog.selectedModelId && model.provider === catalog.selectedProvider) return i
        }
        return -1
    }
    function selectedClipId() {
        const editor = Context.editorFor(panel)
        const tracks = Context.itemNamed(editor, "tracksRegion")
        const selected = tracks ? tracks.gestures.selection : []
        return selected.length === 1 ? selected[0] : ""
    }
    function selectedShotModel() {
        for (const model of shotCatalog.models) {
            if (model.id === shotCatalog.selectedModelId && model.provider === shotCatalog.selectedProvider) return model
        }
        return {}
    }
    function saveShotField(shotId, key, value) {
        const resource = JSON.parse(JSON.stringify(controller.result))
        for (const shot of resource.document.shots || []) {
            if (shot.id !== shotId) continue
            if (key === "duration_seconds") {
                const seconds = Number(value)
                if (!Number.isFinite(seconds) || seconds <= 0) return
                shot.duration_seconds = seconds; shot.duration_source = "manual"
            } else if (key.indexOf("camera.") === 0) {
                if (!shot.camera) shot.camera = {}
                shot.camera[key.slice(7)] = value
            } else shot[key] = value
        }
        controller.saveStoryboard(resource)
    }
    ScrollView {
        anchors.fill: parent
        anchors.margins: Theme.spacingMd
        clip: true
        Column {
        width: panel.width - Theme.spacingMd * 2
        spacing: Theme.spacingMd
        Row {
            spacing: Theme.spacingMd
            Button { text: "Scripts"; onClicked: { panel.documentKind = "scripts"; controller.listScripts() } }
            Button { text: "New linked script"; enabled: !controller.busy; onClicked: { panel.documentKind = "scripts"; controller.createLinkedScript() } }
            Button { text: "Storyboards"; onClicked: { panel.documentKind = "storyboards"; controller.listStoryboards() } }
        }
        Text { text: voicing.error || controller.error; color: Theme.textPrimary; width: parent.width; wrapMode: Text.Wrap }
        Row {
            Button { text: transcription.ready ? "Transcribe selected media" : "Connect transcription"; enabled: !transcription.busy; onClicked: {
                if (!transcription.ready) { transcription.open(); return }
                const editor = Context.editorFor(panel)
                const tracks = Context.itemNamed(editor, "tracksRegion")
                const selected = tracks ? tracks.gestures.selection : []
                if (selected.length === 1) transcription.submit(selected[0], "openai", "whisper-1")
            } }
            Button { text: "Apply transcript"; visible: transcription.hasCandidate; onClicked: transcription.apply() }
            Button { text: "Cancel"; visible: transcription.busy; onClicked: transcription.cancel() }
        }
        Text { visible: transcription.error !== ""; text: transcription.error; color: Theme.textPrimary; width: parent.width; wrapMode: Text.Wrap }
        Button { text: "Extract script"; enabled: !controller.busy; onClicked: { panel.documentKind = "scripts"; controller.extractScript() } }
        Button { text: "Remove filler words"; onClicked: controller.removeFillers() }
        Text { text: "Voiceover beats"; color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmall }
        ComboBox {
            width: parent.width
            model: voiceCatalog.models
            currentIndex: panel.selectedModelIndex(voiceCatalog)
            textRole: "name"
            displayText: currentIndex < 0 ? "Choose a voice model" : currentText
            onActivated: index => { const model = voiceCatalog.models[index]; voiceCatalog.selectModel(model.id, model.provider) }
        }
        TextField { id: beatVoice; width: parent.width; text: "alloy"; placeholderText: "Voice" }
        TextArea { id: newBeat; width: parent.width; placeholderText: "Write a voiceover beat"; wrapMode: TextEdit.Wrap }
        Button { text: "Add beat"; onClicked: { if (controller.addBeat(newBeat.text, voiceCatalog.selectedProvider, voiceCatalog.selectedModelId, beatVoice.text)) newBeat.clear() } }
        Text { text: beatVoicing.error; visible: beatVoicing.error !== ""; color: Theme.textPrimary; width: parent.width; wrapMode: Text.Wrap }
        Repeater {
            model: controller.beats
            delegate: Column {
                id: beatRow
                required property var modelData
                required property int index
                width: panel.width - Theme.spacingMd * 2
                TextField { width: parent.width; text: beatRow.modelData.prompt || ""; onEditingFinished: controller.setBeatText(beatRow.modelData.id, text) }
                Row {
                    Button { text: "Voice"; enabled: !beatVoicing.busy; onClicked: beatVoicing.voice(beatRow.modelData.id, voiceCatalog.selectedProvider, voiceCatalog.selectedModelId, beatVoice.text) }
                    Button { text: "Recover"; enabled: !beatVoicing.busy; onClicked: beatVoicing.recover(beatRow.modelData.id) }
                    Button { text: "Delete"; onClicked: controller.deleteBeat(beatRow.modelData.id) }
                    Button { text: "Up"; enabled: beatRow.index > 0; onClicked: {
                        const ids = controller.beats.map(beat => beat.id); const previous = ids[beatRow.index - 1]; ids[beatRow.index - 1] = ids[beatRow.index]; ids[beatRow.index] = previous; controller.reorderBeats(ids)
                    } }
                    Button { text: "Down"; enabled: beatRow.index + 1 < controller.beats.length; onClicked: {
                        const ids = controller.beats.map(beat => beat.id); const next = ids[beatRow.index + 1]; ids[beatRow.index + 1] = ids[beatRow.index]; ids[beatRow.index] = next; controller.reorderBeats(ids)
                    } }
                }
            }
        }
        Row {
            visible: beatVoicing.hasCandidate
            Button { text: "Preview voice"; onClicked: review.preview(beatVoicing.candidate.assetId, "audio", beatVoicing.candidate.durationMs) }
            Button { text: "Apply voice"; onClicked: beatVoicing.apply() }
        }
        Button { text: "Cancel voicing"; visible: beatVoicing.busy; onClicked: beatVoicing.cancel() }
        PreviewCompositor { width: parent.width; height: Theme.toolbarHeight * 4; visible: review.ready; timeline: review.previewTimeline; clock: review.previewClock }
        Row {
            visible: review.ready
            Button { text: review.previewClock.playing ? "Pause preview" : "Play preview"; onClicked: { if (panel.clock) panel.clock.pause(); review.togglePlay() } }
            CheckBox { text: "Preview audio"; checked: false; onToggled: review.audioMode = checked ? "system" : "none" }
            Button { text: "Close preview"; onClicked: review.close() }
        }
        Timer { interval: 16; repeat: true; running: review.previewClock.playing; onTriggered: review.previewClock.tick() }
        Text { text: "Transcript"; color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmall }
        Repeater {
            model: controller.words
            delegate: Row {
                required property var modelData
                width: panel.width - Theme.spacingMd * 2
                TextField {
                    width: parent.width * 0.7
                    text: parent.modelData.word || ""
                    onActiveFocusChanged: if (activeFocus && panel.clock) panel.clock.seek(parent.modelData.absoluteStartMs)
                    onEditingFinished: controller.correctWord(parent.modelData.clipId, parent.modelData.wordIndex, text)
                }
                Button {
                    text: "Cut"
                    onClicked: controller.deleteWords(parent.modelData.absoluteStartMs, parent.modelData.absoluteEndMs)
                }
            }
        }
        Column {
            width: parent.width
            visible: panel.documentKind === "storyboards"
            ComboBox { id: shotKind; width: parent.width; model: ["Video take", "Still take"] }
            ComboBox { id: shotTask; width: parent.width; visible: shotKind.currentIndex === 0; model: ["Direct video models", "Image to video models", "Reference video models"] }
            ComboBox {
                width: parent.width; model: shotCatalog.models; textRole: "name"
                currentIndex: panel.selectedModelIndex(shotCatalog)
                displayText: currentIndex < 0 ? "Choose a shot model" : currentText
                onActivated: index => { const model = shotCatalog.models[index]; shotCatalog.selectModel(model.id, model.provider) }
            }
            Text { text: shotCatalog.error || shots.error; visible: text !== ""; width: parent.width; wrapMode: Text.Wrap; color: Theme.textPrimary }
            Button { text: "Cancel render"; visible: shots.busy; onClicked: shots.cancel() }
            Text { text: production.error; visible: text !== ""; width: parent.width; wrapMode: Text.Wrap; color: Theme.textPrimary }
            Column {
                width: parent.width
                visible: production.summary.request !== undefined
                Text { width: parent.width; wrapMode: Text.Wrap; color: Theme.textPrimary; text: (production.summary.requestCount || 1) + (production.summary.requestCount === 1 ? " request" : " requests") }
                Repeater {
                    model: production.summary.requestSummaries || []
                    delegate: Text {
                        required property var modelData
                        width: parent.width
                        wrapMode: Text.Wrap
                        color: Theme.textPrimary
                        text: "Take " + modelData.take + " · " + (modelData.provider || "") + "/" + (modelData.model || "") + " · " + (modelData.durationSeconds > 0 ? modelData.durationSeconds + "s" : "model default duration") + " · " + (modelData.referenceCount || 0) + " references"
                    }
                }
                Text { width: parent.width; wrapMode: Text.Wrap; color: Theme.textSecondary; text: production.summary.priceLabel || "Price unavailable" }
                Row {
                    Button { text: "Approve request"; enabled: !production.busy && !shots.busy && !production.approved; onClicked: production.approve() }
                    Button { text: "Render reviewed request"; enabled: production.approved && !production.busy && !shots.busy; onClicked: {
                        const model = panel.selectedShotModel()
                        if (!production.consume(controller.result, panel.reviewedShotId, panel.reviewedShotKind, model)) return
                        const reviewedModel = Object.assign({}, model, { reviewedRequests: production.summary.requests })
                        shots.render(controller.result, panel.reviewedShotId, panel.reviewedShotKind, reviewedModel)
                    } }
                }
            }
        }
        Button {
            text: "Assemble in this timeline"
            visible: panel.documentKind === "storyboards" && !!controller.result && controller.result.document !== undefined
            enabled: !controller.busy
            onClicked: controller.assembleStoryboard(controller.result)
        }
        Text {
            visible: panel.documentKind === "scripts" && !!controller.result && controller.result.document !== undefined
            text: (controller.scriptHeader.title || "Script") + " · " + (controller.scriptHeader.lineCount || 0) + " lines"
            color: Theme.textPrimary
        }
        Row {
            visible: panel.documentKind === "scripts" && !!controller.result && controller.result.document !== undefined
            Button { visible: panel.workspaceMode; text: "Apply script revision to cut"; enabled: !controller.busy && !controller.scriptDirty; onClicked: controller.applyScriptRevision(controller.result.id) }
            Button { text: "Open script editor"; enabled: controller.scriptEditorLink.toString() !== ""; onClicked: Qt.openUrlExternally(controller.scriptEditorLink) }
            Button { text: "Link script"; enabled: !controller.busy; onClicked: controller.linkScript(controller.result.id, true) }
            Button { text: "Unlink script"; enabled: !controller.busy; onClicked: controller.linkScript(controller.result.id, false) }
        }
        Repeater {
            model: {
                const resource = controller.result
                if (!resource || !resource.document) return []
                if (panel.documentKind === "scripts") return controller.scriptRows
                return resource.document.shots || []
            }
            delegate: Column {
                id: scriptLineRow
                required property var modelData
                readonly property bool lineDirty: { controller.scriptDraftRevision; return controller.hasScriptLineDraft(modelData.scriptId || "", modelData.id || "") }
                width: panel.width - Theme.spacingMd * 2
                Text {
                    visible: panel.documentKind === "scripts" && scriptLineRow.modelData.kind === "section"
                    text: scriptLineRow.modelData.title || ""
                    color: Theme.textSecondary
                }
                Text {
                    visible: panel.documentKind === "scripts" && !!scriptLineRow.modelData.showSpeaker
                    text: scriptLineRow.modelData.speakerName || ""
                    color: Theme.textSecondary
                }
                TextArea {
                    width: parent.width
                    property var modelData: scriptLineRow.modelData
                    visible: panel.documentKind !== "scripts" || modelData.kind === "line"
                    enabled: !controller.busy
                    placeholderText: panel.documentKind === "scripts" ? "Write a line" : "Shot description"
                    wrapMode: TextEdit.Wrap
                    text: panel.documentKind === "scripts" ? modelData.text || "" : modelData.action || ""
                    Keys.onPressed: event => {
                        if (panel.documentKind === "scripts" && event.key === Qt.Key_Backspace && text === "") {
                            event.accepted = true
                            controller.removeEmptyScriptLineForScript(modelData.scriptId, modelData.id, text)
                        }
                    }
                    onActiveFocusChanged: {
                        if (!activeFocus || panel.documentKind !== "scripts" || !modelData.clipId) return
                        if (panel.clock) panel.clock.seek(modelData.clipStartMs)
                        const editor = Context.editorFor(panel)
                        const tracks = Context.itemNamed(editor, "tracksRegion")
                        if (tracks) tracks.gestures.selection = [modelData.clipId]
                    }
                    onTextEdited: {
                        if (panel.documentKind === "scripts") controller.setScriptLineDraft(modelData.scriptId, modelData.id, text)
                    }
                    onEditingFinished: {
                        if (panel.documentKind === "scripts") controller.saveScriptLineDraft(modelData.scriptId, modelData.id)
                        else panel.saveShotField(modelData.id, "action", text)
                    }
                }
                Column {
                    visible: panel.documentKind === "storyboards"
                    width: parent.width
                    Repeater {
                        model: [
                            { key: "dialogue", label: "Dialogue" }, { key: "motion", label: "Motion" }, { key: "sound", label: "Sound" },
                            { key: "duration_seconds", label: "Length in seconds" }, { key: "camera.framing", label: "Framing" },
                            { key: "camera.angle", label: "Angle" }, { key: "camera.movement", label: "Camera movement" }
                        ]
                        delegate: TextField {
                            required property var modelData
                            width: scriptLineRow.width
                            placeholderText: modelData.label
                            text: modelData.key.indexOf("camera.") === 0 ? (scriptLineRow.modelData.camera || {})[modelData.key.slice(7)] || "" : String(scriptLineRow.modelData[modelData.key] || "")
                            onEditingFinished: panel.saveShotField(scriptLineRow.modelData.id, modelData.key, text)
                        }
                    }
                    ComboBox {
                        width: parent.width; model: ["keyframe", "direct", "reference"]
                        currentIndex: Math.max(0, model.indexOf(scriptLineRow.modelData.render_mode || "keyframe"))
                        onActivated: panel.saveShotField(scriptLineRow.modelData.id, "render_mode", currentText)
                    }
                    Row {
                        Button { text: "Review new take"; enabled: !shots.busy && !production.busy; onClicked: {
                            panel.reviewedShotId = scriptLineRow.modelData.id
                            panel.reviewedShotKind = shotKind.currentIndex === 1 ? "image" : "video"
                            production.reviewShot(controller.result, panel.reviewedShotId, panel.reviewedShotKind, panel.selectedShotModel())
                        } }
                        Button { text: "Recover render"; enabled: !shots.busy; onClicked: shots.recover(controller.result, scriptLineRow.modelData.id, shotKind.currentIndex === 1 ? "image" : "video") }
                    }
                    Button {
                        text: "Place shot at playhead"
                        enabled: !production.busy && !controller.busy
                        onClicked: {
                            const editor = Context.editorFor(panel)
                            const tracks = Context.itemNamed(editor, "tracksRegion")
                            production.placeShot(controller.result, scriptLineRow.modelData.id, panel.clock ? panel.clock.time : 0, "", tracks ? tracks.gestures.dropMode : "overwrite")
                        }
                    }
                    Row {
                        Button { text: "Link selected clip"; enabled: panel.selectedClipId() !== ""; onClicked: shots.link(controller.result, panel.selectedClipId(), scriptLineRow.modelData.id) }
                        Button { text: "Unlink selected clip"; enabled: panel.selectedClipId() !== ""; onClicked: shots.unlink(panel.selectedClipId()) }
                    }
                    TextArea { id: deriveAction; width: parent.width; placeholderText: "Describe a derived shot"; wrapMode: TextEdit.Wrap }
                    Row {
                        SpinBox { id: deriveFrames; from: 1; to: 8; value: 3 }
                        Button { text: "Derive from selected clip"; enabled: !shots.busy && panel.selectedClipId() !== ""; onClicked: shots.derive(controller.result, panel.selectedClipId(), deriveFrames.value, deriveAction.text) }
                    }
                    Repeater {
                        model: shots.candidates(controller.result, scriptLineRow.modelData.id, shotKind.currentIndex === 1 ? "image" : "video")
                        delegate: Row {
                            required property var modelData
                            Button { text: "Preview take"; onClicked: review.preview(parent.modelData.asset_id, shotKind.currentIndex === 1 ? "image" : "video", (parent.modelData.duration || scriptLineRow.modelData.duration_seconds || 4) * 1000) }
                            Button { text: parent.modelData.selected ? "Selected take" : "Use take"; enabled: !parent.modelData.selected && !shots.busy; onClicked: shots.accept(controller.result, scriptLineRow.modelData.id, shotKind.currentIndex === 1 ? "image" : "video", parent.modelData.versionIndex) }
                        }
                    }
                }
                Text {
                    visible: panel.documentKind === "scripts" && !!scriptLineRow.modelData.draftOrphan
                    width: parent.width
                    wrapMode: Text.Wrap
                    color: Theme.textSecondary
                    text: "This line was removed remotely. Your draft is retained for copying into a new line."
                }
                Row {
                spacing: Theme.spacingMd
                Button {
                    visible: panel.documentKind === "scripts" && scriptLineRow.lineDirty
                    enabled: !controller.busy && !scriptLineRow.modelData.draftOrphan
                    text: scriptLineRow.modelData.draftRemove ? "Retry removal" : "Save changes"
                    onClicked: controller.saveScriptLineDraft(scriptLineRow.modelData.scriptId, scriptLineRow.modelData.id)
                }
                Button {
                    visible: panel.documentKind === "scripts" && !!scriptLineRow.modelData.canVoice
                    enabled: !controller.busy && !voicing.busy && !scriptLineRow.lineDirty
                    text: "Voice"
                    onClicked: voicing.voice(controller.result, scriptLineRow.modelData.id)
                }
                Button {
                    visible: panel.documentKind === "scripts" && scriptLineRow.modelData.kind === "line"
                    enabled: !controller.busy && !voicing.busy
                    text: "Recover take"
                    onClicked: voicing.recover(controller.result, scriptLineRow.modelData.id)
                }
                }
            }
        }
        Button {
            visible: panel.documentKind === "scripts" && !!controller.result && controller.result.document !== undefined
            text: "Add line"
            objectName: "timelineScriptAddLine"
            enabled: !controller.busy
            onClicked: controller.addScriptLine()
        }
        Button { visible: voicing.busy; text: "Cancel voicing"; onClicked: voicing.cancel() }
        Repeater {
            model: Array.isArray(controller.result) ? controller.result : []
            delegate: Button {
                required property var modelData
                text: modelData.name || modelData.id
                onClicked: panel.documentKind === "scripts" ? controller.openScript(modelData.id) : controller.openStoryboard(modelData.id)
            }
        }
    }
    }
}

import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: panel
    variant: Ui.Surface.Canvas
    objectName: "storyWorkspaceEditor"
    required property var controller
    required property var workspace
    property string kind: "scripts"
    property string fixedKind: ""
    property var mediaBrowser: null
    // Lists documents for the link dialog without replacing the open document.
    property var picker: null
    readonly property bool linkedMode: fixedKind !== ""
    property bool unlinked: false
    property var steps: []
    property string selectedShotId: ""
    property string returnId: ""
    property string returnKind: ""
    property var voiceQueue: []
    property bool voiceNext: false
    property string voicingLineId: ""
    readonly property var voiceTargets: controller.scriptRows.filter(row => row.kind === "line" && row.hasVoice && row.status !== "voiced" && (row.text || "").trim() !== "" && !row.draftDirty)
    function voiceLine(lineId) {
        voicingLineId = lineId
        voicing.voice(controller.result, lineId)
    }
    function voiceAll() {
        voiceQueue = voiceTargets.map(row => row.id)
        voiceQueued()
    }
    function voiceQueued() {
        if (voiceQueue.length === 0) { voicingLineId = ""; return }
        const next = voiceQueue[0]
        voiceQueue = voiceQueue.slice(1)
        voiceLine(next)
    }
    property string playingTakeId: ""
    function playTake(take) {
        if (playingTakeId === take.id && takePlayer.ready) { takePlayer.togglePlay(); return }
        takePlayer.close()
        playingTakeId = take.id
        takePlayer.preview(take.assetId, "audio", take.durationMs || 0)
    }
    function seconds(ms) { return ms > 0 ? (ms / 1000).toFixed(1) + " s" : "" }
    readonly property var resource: workspace.resource
    readonly property bool hasDocument: !!resource.id && !(linkedMode && unlinked)
    readonly property var document: hasDocument ? resource.document || ({}) : ({})
    readonly property bool showingList: controller.result !== null && controller.result !== undefined && typeof controller.result.length === "number"
    readonly property var resourceList: {
        if (!showingList) return []
        const needle = documentSearch.text.trim().toLowerCase()
        const rows = Array.from(controller.result).filter(row => !needle || (row.name || "").toLowerCase().includes(needle))
        rows.sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0))
        let previous = ""
        return rows.map(row => {
            const group = panel.dateGroup(row.updatedAt)
            const result = Object.assign({}, row, {dateGroup: group, showGroup: group !== previous})
            previous = group
            return result
        })
    }
    readonly property var scriptStats: {
        controller.scriptDraftRevision
        let lines = 0, words = 0
        for (const row of controller.scriptRows) {
            if (row.kind !== "line") continue
            ++lines
            const text = (row.text || "").trim()
            if (text) words += text.split(/\s+/).length
        }
        return {lines, words}
    }
    readonly property string documentKind: document.shots !== undefined ? "storyboards" : "scripts"
    readonly property bool showsBoard: hasDocument && documentKind === "storyboards" && kind !== "entities"
    signal linkedResourceRequested(string kind, string id)
    clip: true

    function browse(nextKind) {
        kind = nextKind
        documentSearch.clear()
        selectedShotId = ""
        controller.listContextResources(kind, linked.checked)
    }
    // Each step either starts a server call or returns false to stop the sequence.
    function run(list) { steps = list; advance() }
    function advance() {
        while (steps.length > 0 && !controller.busy) {
            const next = steps[0]
            steps = steps.slice(1)
            if (next() === false) steps = []
        }
    }
    function newest(rows) {
        return Array.from(rows || []).sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0))
    }
    function loadLinked() {
        if (fixedKind === "storyboards") {
            const board = workspace.linkedResources.find(row => row.kind === "storyboards")
            if (board) openResource(board.id, "storyboards")
            else unlinked = true
            return
        }
        run([() => controller.listContextResources("scripts", true), () => {
            const rows = showingList ? newest(controller.result) : []
            if (rows.length === 0) { unlinked = true; return false }
            openResource(rows[0].id, "scripts")
        }])
    }
    function linkDocument(id) {
        if (fixedKind === "storyboards") { openResource(id, "storyboards"); return }
        const previous = hasDocument ? resource.id : ""
        const list = []
        if (previous && previous !== id) list.push(() => controller.linkScript(previous, false))
        list.push(() => controller.linkScript(id, true), () => openResource(id, "scripts"))
        run(list)
    }
    function unlinkDocument() {
        if (!hasDocument) return
        const id = resource.id
        run([() => controller.linkScript(id, false), () => { unlinked = true }])
    }
    function createLinkedDocument() {
        const previous = hasDocument ? resource.id : ""
        const list = []
        if (previous) list.push(() => controller.linkScript(previous, false))
        list.push(() => controller.createLinkedScript(), () => loadLinked())
        run(list)
    }
    function choose() {
        linkDialog.currentId = hasDocument ? resource.id : ""
        linkDialog.open()
    }
    function openResource(id, nextKind) {
        if (fixedKind !== "" && nextKind !== fixedKind && nextKind !== "entities") {
            linkedResourceRequested(nextKind, id)
            return
        }
        unlinked = false
        kind = nextKind
        selectedShotId = ""
        if (kind === "scripts") controller.openScript(id)
        else controller.openStoryboard(id)
    }
    function entityName(id, index) {
        for (const speaker of document.cast || []) {
            if (speaker.entityId === id && speaker.name) return speaker.name
        }
        return "Reference " + (index + 1)
    }

    function dateGroup(value) {
        const date = new Date(value || "")
        if (!Number.isFinite(date.getTime())) return ""
        const now = new Date()
        if (date.toDateString() === now.toDateString()) return "Today"
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
        if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
        return now - date < 7 * 24 * 60 * 60 * 1000 ? "Previous 7 days" : "Earlier"
    }

    component DocumentGlyph: Ui.Icon {
        property bool board: false
        name: board ? "layers" : "subtitles"
        size: Ui.Metrics.iconSm
        tone: board ? Ui.Text.Info : Ui.Text.Warning
    }

    component WorkspaceButton: Ui.EditorButton {
        property bool primary: false
        property bool leftAligned: false
        property bool quiet: false
        variant: primary ? Ui.EditorButton.Primary : quiet ? Ui.EditorButton.Flat : Ui.EditorButton.Default
        contentAlignment: leftAligned ? Qt.AlignLeft : Qt.AlignHCenter
    }
    component WorkspaceLabel: Ui.Text {
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Secondary
        wrapMode: Text.WordWrap
    }
    component WorkspaceField: Ui.TextField { selectByMouse: true }
    component WorkspaceArea: Ui.TextArea {
        property bool quiet: false
        variant: quiet ? Ui.TextArea.Quiet : Ui.TextArea.Field
        selectByMouse: true
    }
    component WorkspaceCheckBox: Ui.Toggle {}

    Connections {
        target: panel.controller
        function onChanged() {
            if (!panel.controller.busy && panel.steps.length > 0) Qt.callLater(panel.advance)
            if (!panel.controller.busy && panel.voiceNext) { panel.voiceNext = false; Qt.callLater(panel.voiceQueued) }
        }
    }
    CandidatePreview {
        id: takePlayer
        objectName: "workspaceTakePlayer"
        timeline: panel.controller.timeline
        audioMode: "system"
        onReadyChanged: if (ready && panel.playingTakeId !== "" && !previewClock.playing) togglePlay()
    }
    FrameAnimation {
        running: takePlayer.previewClock.playing
        onTriggered: {
            takePlayer.previewClock.tick()
            if (takePlayer.previewClock.time >= takePlayer.previewClock.durationMs) { takePlayer.close(); panel.playingTakeId = "" }
        }
    }
    Component.onDestruction: takePlayer.close()
    // Voices one line at a time. Each saved take reloads the script before the next line starts.
    ScriptVoicing {
        id: voicing
        timeline: panel.controller.timeline
        onSaved: scriptId => { panel.voiceNext = panel.voiceQueue.length > 0; panel.controller.openScript(scriptId) }
        onStateChanged: if (state === "failed" || state === "cancelled") { panel.voiceQueue = []; panel.voicingLineId = "" }
    }
    LinkDocumentDialog {
        id: linkDialog
        controller: panel.picker
        kind: panel.fixedKind || "scripts"
        onPicked: id => panel.linkDocument(id)
        onCreateRequested: panel.createLinkedDocument()
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm
        RowLayout {
            objectName: "workspaceLinkedHeader"
            Layout.fillWidth: true
            visible: panel.linkedMode && panel.hasDocument && panel.kind !== "entities"
            spacing: Ui.Metrics.sm
            DocumentGlyph { board: panel.documentKind === "storyboards" }
            Column {
                Layout.fillWidth: true
                spacing: Ui.Metrics.micro
                Ui.Text {
                    objectName: "workspaceLinkedName"
                    width: parent.width
                    text: resource.name || (panel.documentKind === "scripts" ? "Untitled script" : "Untitled storyboard")
                    role: Ui.Typography.SansLabel
                    elide: Text.ElideRight
                }
                Ui.Text {
                    width: parent.width
                    text: (document.shots ? document.shots.length + (document.shots.length === 1 ? " shot" : " shots") : panel.scriptStats.lines + (panel.scriptStats.lines === 1 ? " line" : " lines")) + (workspace.dirty || controller.scriptDirty ? " · Edited" : "")
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    elide: Text.ElideRight
                }
            }
            Ui.ToolbarIconButton {
                objectName: "workspaceChangeLink"
                iconName: panel.fixedKind === "scripts" ? "link" : "swapHoriz"
                accessibleName: panel.fixedKind === "scripts" ? "Link a different script" : "Choose a different storyboard"
                description: accessibleName
                enabled: !controller.busy && !!panel.picker
                onClicked: panel.choose()
            }
            Ui.ToolbarIconButton {
                objectName: "workspaceUnlink"
                visible: panel.fixedKind === "scripts"
                iconName: "linkOff"
                accessibleName: "Unlink script"
                description: accessibleName
                enabled: !controller.busy && !controller.scriptDirty
                onClicked: panel.unlinkDocument()
            }
        }
        Ui.Separator { Layout.fillWidth: true; visible: panel.linkedMode && panel.hasDocument && panel.kind !== "entities" }
        Item {
            objectName: "workspaceLinkEmpty"
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: panel.linkedMode && !panel.hasDocument && !controller.busy && panel.steps.length === 0
            Column {
                anchors.centerIn: parent
                width: Math.min(parent.width - 2 * Ui.Metrics.lg, Ui.Metrics.dialogCompactWidth)
                spacing: Ui.Metrics.md
                Ui.Icon {
                    anchors.horizontalCenter: parent.horizontalCenter
                    name: panel.fixedKind === "scripts" ? "subtitles" : "gridGoldenratio"
                    size: Ui.Metrics.iconLg
                    tone: Ui.Text.Secondary
                }
                Ui.Text {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    text: panel.fixedKind === "scripts" ? "No script linked" : "No storyboard chosen"
                    role: Ui.Typography.SansLabel
                }
                Ui.Text {
                    width: parent.width
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.WordWrap
                    text: controller.offline ? "Connect to a server to link documents."
                        : panel.fixedKind === "scripts" ? "Link a script to edit its lines beside the cut."
                        : "Choose a storyboard to see its shots beside the cut."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: Ui.Metrics.sm
                    visible: !controller.offline
                    Ui.EditorButton {
                        objectName: "workspaceLinkButton"
                        text: panel.fixedKind === "scripts" ? "Link script…" : "Choose storyboard…"
                        iconName: panel.fixedKind === "scripts" ? "link" : ""
                        variant: Ui.EditorButton.Primary
                        enabled: !!panel.picker
                        onClicked: panel.choose()
                    }
                    Ui.EditorButton {
                        visible: panel.fixedKind === "scripts"
                        text: "New script"
                        iconName: "add"
                        onClicked: panel.createLinkedDocument()
                    }
                }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            visible: !panel.linkedMode
            spacing: Ui.Metrics.sm
            Ui.Select {
                id: documentSelector
                objectName: "workspaceDocumentKind"
                visible: panel.fixedKind === ""
                Layout.fillWidth: true
                Layout.minimumWidth: 0
                options: [{label: "Scripts", value: "scripts"}, {label: "Storyboards", value: "storyboards"}]
                value: panel.kind === "storyboards" || (panel.kind === "entities" && panel.returnKind === "storyboards") ? "storyboards" : "scripts"
                accessibleName: "Document type"
                enabled: !controller.busy
                onValueCommitted: next => panel.browse(next)
            }
            Ui.Text {
                objectName: "workspaceTitle"
                visible: panel.fixedKind !== ""
                Layout.fillWidth: true
                role: Ui.Typography.SansLabel
                text: panel.fixedKind === "storyboards" ? qsTr("Storyboards") : qsTr("Scripts")
            }
            WorkspaceButton { text: "Refresh"; enabled: !controller.busy; onClicked: panel.browse(panel.kind === "entities" ? panel.returnKind : panel.kind) }
        }
        WorkspaceField {
            id: documentSearch
            objectName: "workspaceSearch"
            Layout.fillWidth: true
            visible: !resource.id && !panel.linkedMode
            placeholderText: panel.kind === "storyboards" ? "Search storyboards" : "Search scripts"
            Accessible.name: placeholderText
        }
        WorkspaceCheckBox {
            id: linked
            text: "Linked to this timeline only"
            visible: panel.kind === "scripts" && !panel.linkedMode
            checked: false
            enabled: !controller.busy
            onToggled: panel.browse("scripts")
        }
        WorkspaceLabel {
            Layout.fillWidth: true
            text: workspace.error || controller.error
            // With no server, the list message already explains the state.
            visible: text !== "" && !(panel.linkedMode && controller.offline) && !(controller.offline && !workspace.error && !resource.id)
            tone: Ui.Text.Error
            Accessible.role: Accessible.AlertMessage
        }
        WorkspaceLabel { visible: controller.busy && !panel.hasDocument; text: "Loading documents…" }
        ColumnLayout {
            Layout.fillWidth: true
            visible: panel.hasDocument && !panel.linkedMode
            spacing: Ui.Metrics.sm
            RowLayout {
                Layout.fillWidth: true
                DocumentGlyph { board: panel.documentKind === "storyboards"; visible: panel.kind !== "entities" }
                WorkspaceLabel {
                    Layout.fillWidth: true
                    text: resource.name || (resource.metadata || {}).nodetool_entity?.name || (panel.documentKind === "scripts" ? "Untitled script" : "Untitled storyboard")
                    tone: Ui.Text.Primary
                    role: Ui.Typography.SansBody

                }
                WorkspaceLabel { text: workspace.dirty || controller.scriptDirty ? "Edited" : "Saved"; role: Ui.Typography.SansCaption; tone: workspace.dirty || controller.scriptDirty ? Ui.Text.Warning : Ui.Text.Secondary }
            }
            WorkspaceLabel {
                text: document.shots ? document.shots.length + (document.shots.length === 1 ? " shot" : " shots") : panel.scriptStats.lines + (panel.scriptStats.lines === 1 ? " line · " : " lines · ") + panel.scriptStats.words + (panel.scriptStats.words === 1 ? " word" : " words")
                visible: panel.kind !== "entities"
                role: Ui.Typography.SansCaption
            }
            Ui.Separator { Layout.fillWidth: true }
        }
        StoryboardBoard {
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: panel.showsBoard
            workspace: panel.workspace
            controller: panel.controller
            renders: shotRenders
            mediaBrowser: panel.mediaBrowser
            onEditShotRequested: id => panel.selectedShotId = id
            onEntityRequested: id => { panel.returnId = panel.resource.id; panel.returnKind = panel.documentKind; panel.kind = "entities"; panel.controller.openEntity(id) }
            onScriptRequested: id => panel.openResource(id, "scripts")
        }
        ScrollView {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: (!panel.linkedMode || panel.hasDocument) && !panel.showsBoard
            clip: true
            rightPadding: Ui.Metrics.md
            contentWidth: Math.max(0, width - rightPadding)
            ScrollBar.vertical: Ui.ScrollBar {}
            Column {
                width: scroll.contentWidth
                spacing: Ui.Metrics.md
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    visible: !resource.id && !panel.linkedMode
                    WorkspaceLabel {
                        width: parent.width
                        objectName: "workspaceListMessage"
                        visible: !controller.busy && panel.resourceList.length === 0
                        text: documentSearch.text.trim() ? "No matching " + panel.kind + ". Try a different search." : panel.showingList ? "No " + panel.kind + " in this context." : "Open a server timeline to load " + panel.kind + "."
                    }
                    WorkspaceButton {
                        text: "New script"
                        visible: panel.kind === "scripts"
                        enabled: !controller.busy
                        onClicked: controller.createLinkedScript()
                    }
                }
                Repeater {
                    model: panel.linkedMode ? [] : panel.resourceList
                    delegate: Column {
                        required property var modelData
                        width: parent.width
                        spacing: Ui.Metrics.xs
                        WorkspaceLabel {
                            width: parent.width
                            visible: modelData.showGroup && modelData.dateGroup !== ""
                            text: modelData.dateGroup.toUpperCase()
                            role: Ui.Typography.SansCaption
                        }
                        WorkspaceButton {
                            id: documentRow
                            width: parent.width
                            objectName: "workspaceResource_" + modelData.id
                            text: modelData.name || "Untitled document"
                            leftAligned: true
                            quiet: true
                            enabled: !controller.busy
                            onClicked: panel.openResource(modelData.id, panel.kind)
                            iconName: panel.kind === "storyboards" ? "layers" : "subtitles"
                        }
                    }
                }
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    visible: panel.hasDocument && (!panel.linkedMode || panel.kind === "entities")
                    WorkspaceButton {
                        objectName: "workspaceBackToDocument"
                        text: panel.kind === "entities" ? "Back to document" : "All " + panel.documentKind
                        enabled: !controller.busy
                        onClicked: {
                            if (panel.kind === "entities" && panel.returnId !== "") panel.openResource(panel.returnId, panel.returnKind)
                            else panel.browse(panel.documentKind)
                        }
                    }
                }
                Repeater {
                    model: panel.linkedMode ? [] : workspace.linkedResources
                    delegate: WorkspaceButton {
                        required property var modelData
                        width: parent.width
                        text: "Open linked " + (modelData.kind === "scripts" ? "script" : "storyboard")
                        enabled: !controller.busy
                        onClicked: panel.openResource(modelData.id, modelData.kind)
                    }
                }
                WorkspaceButton { text: "Open linked script"; visible: !panel.linkedMode && !!document.screenplay?.script_id; enabled: !controller.busy; onClicked: panel.openResource(document.screenplay.script_id, "scripts") }
                WorkspaceButton { text: "Open linked storyboard"; visible: !panel.linkedMode && !!resource.storyboardId; enabled: !controller.busy; onClicked: panel.openResource(resource.storyboardId, "storyboards") }
                Flow {
                    objectName: "workspaceScriptVoiceBar"
                    width: parent.width
                    visible: !!document.sections
                    spacing: Ui.Metrics.sm
                    WorkspaceButton {
                        objectName: "workspaceVoiceAll"
                        primary: true
                        text: voicing.busy && panel.voiceQueue.length > 0 ? "Voicing… " + panel.voiceQueue.length + " left" : "Voice all (" + panel.voiceTargets.length + ")"
                        enabled: !controller.busy && !voicing.busy && panel.voiceTargets.length > 0 && !workspace.dirty
                        onClicked: panel.voiceAll()
                    }
                    WorkspaceButton {
                        text: "Stop"
                        visible: voicing.busy
                        onClicked: { panel.voiceQueue = []; voicing.cancel() }
                    }
                    WorkspaceButton {
                        objectName: "workspaceAddToTimeline"
                        readonly property bool linked: { controller.result; return controller.scriptOnTimeline() }
                        text: linked ? "Clips on this timeline" : "Add voice clips to timeline"
                        enabled: !linked && !controller.busy && !workspace.dirty
                        onClicked: controller.linkScript(resource.id, true)
                    }
                }
                WorkspaceLabel {
                    width: parent.width
                    visible: voicing.error !== ""
                    text: voicing.error
                    tone: Ui.Text.Error
                }
                Column {
                    id: speakersSection
                    objectName: "workspaceSpeakers"
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    visible: panel.hasDocument && document.cast !== undefined
                    WorkspaceLabel { width: parent.width; text: "SPEAKERS"; role: Ui.Typography.SansCaption }
                    WorkspaceLabel { width: parent.width; visible: (document.cast || []).length === 0; text: "Add a speaker to the script to give it a voice."; tone: Ui.Text.Secondary; wrapMode: Text.Wrap }
                    Repeater {
                        model: document.cast || []
                        delegate: Ui.Surface {
                            id: castMember
                            required property var modelData
                            width: parent.width
                            variant: Ui.Surface.Panel
                            implicitHeight: castColumn.implicitHeight + 2 * Ui.Metrics.md
                            Column {
                                id: castColumn
                                x: Ui.Metrics.md
                                y: Ui.Metrics.md
                                width: parent.width - 2 * Ui.Metrics.md
                                spacing: Ui.Metrics.sm
                                WorkspaceField { width: parent.width; value: castMember.modelData.name || ""; placeholderText: "Speaker name"; Accessible.name: "Speaker name"; enabled: !controller.busy && !controller.scriptDirty; onTextEdited: workspace.patchSpeaker(castMember.modelData.id, "name", text) }
                                WorkspaceLabel { text: "Voice"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                                Loader {
                                    width: parent.width
                                    source: "ScriptVoicePicker.qml"
                                    onLoaded: {
                                        item.binding = Qt.binding(() => castMember.modelData.voice || null)
                                        item.editable = Qt.binding(() => !controller.busy && !controller.scriptDirty)
                                        item.changed.connect(binding => workspace.patchSpeaker(castMember.modelData.id, "voice", binding))
                                    }
                                }
                            }
                        }
                    }
                }
                Repeater {
                    model: document.sections ? controller.scriptRows : []
                    delegate: Item {
                        id: line
                        required property var modelData
                        readonly property bool isSection: modelData.kind === "section"
                        readonly property bool lineDirty: { controller.scriptDraftRevision; return controller.hasScriptLineDraft(modelData.scriptId || "", modelData.id || "") }
                        width: parent.width
                        height: lineContent.implicitHeight + (isSection ? Ui.Metrics.sm : 2 * Ui.Metrics.lg)
                        Ui.Surface { anchors.fill: parent; visible: !line.isSection }
                        Column {
                            id: lineContent
                            x: line.isSection ? 0 : Ui.Metrics.lg
                            y: line.isSection ? 0 : Ui.Metrics.lg
                            width: parent.width - (line.isSection ? 0 : 2 * Ui.Metrics.lg)
                            spacing: Ui.Metrics.sm
                            WorkspaceLabel {
                                width: parent.width
                                visible: line.isSection
                                text: (line.modelData.title || "Untitled section").toUpperCase()
                                role: Ui.Typography.SansCaption

                            }
                            RowLayout {
                                width: parent.width
                                visible: !line.isSection
                                spacing: Ui.Metrics.lg
                                WorkspaceArea {
                                    Layout.fillWidth: true
                                    objectName: "workspaceScriptLine_" + line.modelData.id
                                    quiet: true
                                    role: Ui.Typography.SansBody
                                    enabled: !controller.busy && !workspace.dirty
                                    value: line.modelData.text || ""
                                    placeholderText: "Write a line…"
                                    Accessible.name: "Script line"
                                    onTextEdited: controller.setScriptLineDraft(line.modelData.scriptId, line.modelData.id, text)
                                }
                            }
                            RowLayout {
                                width: parent.width
                                visible: !line.isSection && !line.modelData.draftOrphan
                                spacing: Ui.Metrics.sm
                                Ui.Select {
                                    objectName: "workspaceLineSpeaker_" + line.modelData.id
                                    Layout.alignment: Qt.AlignTop
                                    Layout.preferredWidth: Ui.Metrics.comfortable * 4
                                    options: [{label: "No speaker", value: ""}].concat((document.cast || []).map(member => ({label: member.name || "Unnamed", value: member.id})))
                                    value: line.modelData.speakerId || ""
                                    accessibleName: "Speaker"
                                    enabled: !controller.busy && !workspace.dirty
                                    onValueCommitted: next => controller.updateScriptLine(line.modelData.id, {speakerId: next || null})
                                }
                                WorkspaceArea {
                                    objectName: "workspaceLineDirection_" + line.modelData.id
                                    Layout.fillWidth: true
                                    Layout.alignment: Qt.AlignTop
                                    wrapMode: TextEdit.Wrap
                                    value: line.modelData.direction || ""
                                    placeholderText: "Direction, e.g. warm, slow"
                                    Accessible.name: "Delivery direction"
                                    enabled: !controller.busy && !workspace.dirty
                                    onEditingFinished: if (text.trim() !== (line.modelData.direction || "")) controller.updateScriptLine(line.modelData.id, {direction: text.trim() || null})
                                }
                            }
                            RowLayout {
                                width: parent.width
                                visible: !line.isSection && !line.modelData.draftOrphan
                                spacing: Ui.Metrics.sm
                                readonly property bool active: panel.voicingLineId === line.modelData.id && voicing.busy
                                WorkspaceLabel {
                                    Layout.fillWidth: true
                                    role: Ui.Typography.SansCaption
                                    text: parent.active ? "Voicing… " + voicing.state
                                        : !line.modelData.hasVoice ? "Assign a speaker with a voice"
                                        : line.modelData.status === "voiced" ? "Voiced" : line.modelData.status === "stale" ? "Voice outdated" : "Not voiced"
                                    tone: parent.active ? Ui.Text.Info : line.modelData.status === "voiced" ? Ui.Text.Success : Ui.Text.Warning
                                }
                                WorkspaceButton {
                                    objectName: "workspaceVoiceLine_" + line.modelData.id
                                    quiet: true
                                    iconName: line.modelData.status === "draft" ? "" : "refresh"
                                    text: line.modelData.status === "draft" ? "Voice" : "Regenerate"
                                    enabled: !!line.modelData.hasVoice && (line.modelData.text || "").trim() !== "" && !line.lineDirty && !voicing.busy && !controller.busy && !workspace.dirty
                                    onClicked: panel.voiceLine(line.modelData.id)
                                }
                                WorkspaceButton {
                                    text: "Recover"
                                    quiet: true
                                    visible: panel.voicingLineId === line.modelData.id && voicing.state === "failed" && voicing.error.indexOf("Recover") >= 0
                                    onClicked: voicing.recover(controller.result, line.modelData.id)
                                }
                            }
                            RowLayout {
                                id: currentTake
                                width: lineContent.width
                                visible: !line.isSection && !line.modelData.draftOrphan && (line.modelData.takes || []).length > 0
                                spacing: Ui.Metrics.sm
                                readonly property var take: (line.modelData.takes || []).find(item => item.id === line.modelData.currentTakeId) || null
                                readonly property bool playing: !!take && panel.playingTakeId === take.id && takePlayer.previewClock.playing
                                Ui.ToolbarIconButton {
                                    objectName: "workspacePlayCurrentTake_" + line.modelData.id
                                    variant: Ui.EditorButton.Flat
                                    iconName: currentTake.playing ? "pause" : "playArrow"
                                    text: currentTake.playing ? "Pause take" : "Play take"
                                    loading: !!currentTake.take && panel.playingTakeId === currentTake.take.id && takePlayer.busy
                                    enabled: !!currentTake.take && !!currentTake.take.assetId
                                    onClicked: panel.playTake(currentTake.take)
                                }
                                WorkspaceLabel {
                                    Layout.fillWidth: true
                                    role: Ui.Typography.SansCaption
                                    elide: Text.ElideRight
                                    wrapMode: Text.NoWrap
                                    text: !currentTake.take ? "No take selected"
                                        : "Take " + ((line.modelData.takes || []).indexOf(currentTake.take) + 1) + (currentTake.take.durationMs ? " · " + panel.seconds(currentTake.take.durationMs) : "")
                                            + (currentTake.take.textSnapshot && currentTake.take.textSnapshot !== line.modelData.text ? " · older text" : "")
                                }
                                WorkspaceButton {
                                    objectName: "workspaceOpenTakes_" + line.modelData.id
                                    quiet: true
                                    text: "Takes (" + (line.modelData.takes || []).length + ")"
                                    onClicked: { takesDialog.lineId = line.modelData.id; takesDialog.open() }
                                }
                            }
                            WorkspaceLabel { width: parent.width; visible: !!line.modelData.draftOrphan; text: "This line was removed remotely. Copy its text before discarding the draft."; tone: Ui.Text.Warning }
                            WorkspaceButton { objectName: "workspaceSaveLine_" + line.modelData.id; visible: line.lineDirty; text: "Save line"; primary: true; enabled: !controller.busy && !workspace.dirty && !line.modelData.draftOrphan; onClicked: controller.saveScriptLineDraft(line.modelData.scriptId, line.modelData.id) }
                        }
                    }
                }
                WorkspaceButton { text: "Add line"; visible: !!document.sections; enabled: !controller.busy && !controller.scriptDirty && !workspace.dirty; onClicked: controller.addScriptLine() }
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    visible: workspace.entityIds.length > 0
                    WorkspaceLabel { text: "Characters and references";  }
                    Repeater {
                        model: workspace.entityIds
                        delegate: WorkspaceButton {
                            required property string modelData
                            required property int index
                            width: parent.width
                            objectName: "workspaceInspectEntity"
                            text: panel.entityName(modelData, index)
                            leftAligned: true
                            enabled: !controller.busy
                            onClicked: { panel.returnId = resource.id; panel.returnKind = panel.documentKind; panel.kind = "entities"; controller.openEntity(modelData) }
                        }
                    }
                }
                Column {
                    id: entity
                    property var marker: (resource.metadata || {}).nodetool_entity || ({})
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    visible: !!marker.kind
                    Repeater {
                        model: [{key:"name",label:"Name"}, {key:"descriptor",label:"Descriptor"}, {key:"description",label:"Description"}, {key:"voice_id",label:"Voice ID"}, {key:"reference_asset_id",label:"Reference image ID"}]
                        delegate: Column {
                            id: entityField
                            required property var modelData
                            width: entity.width
                            spacing: Ui.Metrics.sm
                            WorkspaceLabel { text: entityField.modelData.label }
                            WorkspaceArea { width: parent.width; value: entity.marker[entityField.modelData.key] || ""; Accessible.name: entityField.modelData.label; enabled: !controller.busy; onTextEdited: workspace.patchEntity(entityField.modelData.key, text === "" && entityField.modelData.key === "reference_asset_id" ? null : text) }
                        }
                    }
                }
                WorkspaceCheckBox { id: metadata; text: "Document details"; visible: panel.hasDocument }
                Column {
                    width: parent.width
                    spacing: Ui.Metrics.sm
                    visible: metadata.visible && metadata.checked
                    WorkspaceLabel { width: parent.width; text: resource.id || ""; role: Ui.Typography.MonoCaption; wrapMode: Text.WrapAnywhere }
                    Repeater {
                        model: document.cast || []
                        delegate: Column {
                            id: speaker
                            required property var modelData
                            width: parent.width
                            spacing: Ui.Metrics.sm
                            WorkspaceField { width: parent.width; value: speaker.modelData.entityId || ""; placeholderText: "Character entity ID"; Accessible.name: "Character entity ID"; enabled: !controller.busy && !controller.scriptDirty; onTextEdited: workspace.patchSpeaker(speaker.modelData.id, "entityId", text === "" ? null : text) }
                        }
                    }
                    WorkspaceArea { width: parent.width; visible: document.shots !== undefined; value: workspace.jsonDraft("", "entityIds", document.entityIds || []); Accessible.name: "Storyboard entity IDs"; enabled: !controller.busy; onTextEdited: workspace.setJsonDraft("", "entityIds", text) }
                }
            }
        }
        ColumnLayout {
            Layout.fillWidth: true
            visible: workspace.dirty || controller.scriptDirty
            spacing: Ui.Metrics.sm
            Ui.Separator { Layout.fillWidth: true }
            WorkspaceLabel {
                Layout.fillWidth: true
                text: workspace.dirty ? "Unsaved document changes" : "Unsaved script lines. Save each edited line."
                tone: Ui.Text.Warning
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.sm
                WorkspaceButton { Layout.fillWidth: true; text: "Save document"; objectName: "workspaceSave"; primary: true; visible: workspace.dirty; enabled: !controller.busy; onClicked: workspace.save() }
                WorkspaceButton {
                    Layout.fillWidth: true
                    id: discardButton
                    text: workspace.dirty ? "Discard changes" : "Discard line drafts"
                    enabled: !controller.busy
                    onClicked: {
                        if (workspace.dirty) discardDialog.open()
                        else { lineDiscardDialog.scriptId = resource.id; lineDiscardDialog.open() }
                    }
                }
            }
        }
    }
    ShotWorkflow {
        id: shotRenders
        objectName: "shotRenders"
        timeline: panel.controller.timeline
        onSaved: board => panel.controller.openStoryboard(board.id)
    }
    // The shot editor covers the board while a shot is open.
    Loader {
        objectName: "shotEditorLoader"
        anchors.fill: parent
        z: Ui.Metrics.layerOverlay
        active: panel.selectedShotId !== "" && panel.documentKind === "storyboards" && panel.hasDocument
        sourceComponent: ShotEditor {
            workspace: panel.workspace
            controller: panel.controller
            mediaBrowser: panel.mediaBrowser
            renders: shotRenders
            shotId: panel.selectedShotId
            Component.onCompleted: forceActiveFocus()
            onCloseRequested: panel.selectedShotId = ""
            onShotChangeRequested: id => panel.selectedShotId = id
            onScriptRequested: (scriptId, lineId) => { if (scriptId !== "") panel.openResource(scriptId, "scripts") }
        }
    }
    Ui.Dialog {
        id: takesDialog
        objectName: "scriptTakesDialog"
        property string lineId: ""
        readonly property var line: controller.scriptRows.find(row => row.id === lineId) || null
        title: "Takes"
        width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width - Ui.Metrics.xl * 2 : Ui.Metrics.dialogWidth)
        onClosed: { takePlayer.close(); panel.playingTakeId = "" }
        footer: RowLayout {
            spacing: Ui.Metrics.sm
            Item { Layout.fillWidth: true }
            Ui.EditorButton {
                objectName: "scriptTakesClose"
                Layout.bottomMargin: Ui.Metrics.xl
                Layout.rightMargin: Ui.Metrics.xl
                variant: Ui.EditorButton.Primary
                text: "Close"
                onClicked: takesDialog.close()
            }
        }
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.sm
            WorkspaceLabel { Layout.fillWidth: true; wrapMode: Text.Wrap; text: takesDialog.line ? takesDialog.line.text || "" : ""; tone: Ui.Text.Secondary }
            Column {
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                            Repeater {
                                model: takesDialog.line ? (takesDialog.line.takes || []) : []
                                delegate: RowLayout {
                                    id: take
                                    required property var modelData
                                    required property int index
                                    readonly property bool current: modelData.id === takesDialog.line.currentTakeId
                                    width: parent.width
                                    spacing: Ui.Metrics.sm
                                    readonly property bool playing: panel.playingTakeId === modelData.id && takePlayer.previewClock.playing
                                    Ui.ToolbarIconButton {
                                        objectName: "workspacePlayTake_" + take.modelData.id
                                        variant: Ui.EditorButton.Flat
                                        iconName: take.playing ? "pause" : "playArrow"
                                        text: take.playing ? "Pause take" : "Play take"
                                        loading: panel.playingTakeId === take.modelData.id && takePlayer.busy
                                        enabled: !!take.modelData.assetId
                                        onClicked: panel.playTake(take.modelData)
                                    }
                                    Ui.Icon { visible: take.current; name: "check"; size: Ui.Metrics.iconSm; tone: Ui.Text.Success }
                                    WorkspaceLabel {
                                        Layout.fillWidth: true
                                        role: Ui.Typography.SansCaption
                                        elide: Text.ElideRight
                                        wrapMode: Text.NoWrap
                                        text: "Take " + (take.index + 1) + (take.modelData.durationMs ? " · " + panel.seconds(take.modelData.durationMs) : "")
                                            + (take.modelData.textSnapshot && take.modelData.textSnapshot !== takesDialog.line.text ? " · older text" : "")
                                        tone: take.current ? Ui.Text.Primary : Ui.Text.Secondary
                                    }
                                    WorkspaceButton {
                                        objectName: "workspaceUseTake_" + take.modelData.id
                                        quiet: true
                                        visible: !take.current
                                        text: "Use"
                                        enabled: !controller.busy && !workspace.dirty
                                        onClicked: controller.updateScriptLine(takesDialog.line.id, {currentTakeId: take.modelData.id})
                                    }
                                    Ui.ToolbarIconButton {
                                        variant: Ui.EditorButton.Flat
                                        iconName: take.modelData.favorite ? "star" : "starBorder"
                                        text: take.modelData.favorite ? "Remove favorite" : "Favorite"
                                        enabled: !controller.busy && !workspace.dirty
                                        onClicked: controller.updateScriptLine(takesDialog.line.id, {takes: takesDialog.line.takes.map(item => item.id === take.modelData.id ? Object.assign({}, item, {favorite: !item.favorite}) : item)})
                                    }
                                    Ui.ToolbarIconButton {
                                        objectName: "workspaceDeleteTake_" + take.modelData.id
                                        variant: Ui.EditorButton.Flat
                                        iconName: "deleteOutline"
                                        text: "Delete take"
                                        enabled: !controller.busy && !workspace.dirty
                                        onClicked: {
                                            const rest = takesDialog.line.takes.filter(item => item.id !== take.modelData.id)
                                            const fields = {takes: rest}
                                            if (take.current) fields.currentTakeId = rest.length > 0 ? rest[rest.length - 1].id : null
                                            controller.updateScriptLine(takesDialog.line.id, fields)
                                        }
                                    }
                                }
                            }
            }
        }
    }
    Ui.Dialog {
        id: lineDiscardDialog
        title: "Discard unsaved script lines?"
        width: Math.min(400 * Ui.Theme.uiScale, parent ? parent.width - Ui.Metrics.xl * 2 : 0)
        property string scriptId: ""
        returnFocusTo: discardButton
        RowLayout {
            Ui.EditorButton { text: "Discard"; onClicked: { controller.discardScriptDrafts(lineDiscardDialog.scriptId); lineDiscardDialog.close() } }
            Ui.EditorButton { text: "Cancel"; onClicked: lineDiscardDialog.close() }
        }
    }
    Ui.Dialog {
        id: discardDialog
        title: "Discard document changes?"
        width: Math.min(400 * Ui.Theme.uiScale, parent ? parent.width - Ui.Metrics.xl * 2 : 0)
        returnFocusTo: discardButton
        RowLayout {
            Ui.EditorButton { text: "Discard"; onClicked: { workspace.discard(); discardDialog.close() } }
            Ui.EditorButton { text: "Cancel"; onClicked: discardDialog.close() }
        }
    }
}

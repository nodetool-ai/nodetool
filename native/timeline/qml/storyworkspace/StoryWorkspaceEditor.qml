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
    property string selectedShotId: ""
    property string returnId: ""
    property string returnKind: ""
    readonly property var resource: workspace.resource
    readonly property var document: resource.document || ({})
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
    readonly property var sceneNames: {
        const result = Object.create(null)
        for (let i = 0; i < (document.scenes || []).length; ++i) {
            const scene = document.scenes[i]
            result[scene.id] = scene.name || scene.title || "Scene " + (i + 1)
        }
        return result
    }
    readonly property string documentKind: document.shots !== undefined ? "storyboards" : "scripts"
    signal linkedResourceRequested(string kind, string id)
    clip: true

    function browse(nextKind) {
        kind = nextKind
        documentSearch.clear()
        selectedShotId = ""
        controller.listContextResources(kind, linked.checked)
    }
    function openResource(id, nextKind) {
        if (fixedKind !== "" && nextKind !== fixedKind && nextKind !== "entities") {
            linkedResourceRequested(nextKind, id)
            return
        }
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
    function mediaId(ref) {
        return ref.asset_id || ((ref.uri || "").startsWith("asset://") ? ref.uri.slice(8) : "")
    }
    function thumbnail(ref) {
        if ((ref.uri || "").startsWith("data:image/")) return ref.uri
        const id = mediaId(ref)
        if (id) return mediaBrowser ? mediaBrowser.thumbnails[id] || "" : ""
        const uri = ref.thumb_url || ref.thumbnail_url || ref.uri || ""
        if (!uri.startsWith("/") && !uri.startsWith("https://") && !uri.startsWith("http://")) return ""
        return mediaBrowser && uri ? mediaBrowser.mediaUrl(uri) : ""
    }
    function shotRatio() {
        const parts = (document.aspect_ratio || "16:9").split(":").map(Number)
        return parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : 16 / 9
    }
    function sceneName(shot) { return sceneNames[shot.scene_id] || "" }

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

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.sm
        RowLayout {
            Layout.fillWidth: true
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
            visible: !resource.id
            placeholderText: panel.kind === "storyboards" ? "Search storyboards" : "Search scripts"
            Accessible.name: placeholderText
        }
        WorkspaceCheckBox {
            id: linked
            text: "Linked to this timeline only"
            visible: panel.kind === "scripts"
            checked: false
            enabled: !controller.busy
            onToggled: panel.browse("scripts")
        }
        WorkspaceLabel {
            Layout.fillWidth: true
            text: workspace.error || controller.error
            visible: text !== ""
            tone: Ui.Text.Error
            Accessible.role: Accessible.AlertMessage
        }
        WorkspaceLabel { visible: controller.busy; text: "Loading documents…" }
        ColumnLayout {
            Layout.fillWidth: true
            visible: !!resource.id
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
        ScrollView {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
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
                    visible: !resource.id
                    WorkspaceLabel {
                        objectName: "workspaceTitle"
                        width: parent.width
                        text: panel.fixedKind === "storyboards" ? qsTr("Storyboards") : qsTr("Scripts")
                        tone: Ui.Text.Primary
                        role: Ui.Typography.SansBody

                    }
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
                    model: panel.resourceList
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
                    visible: !!resource.id
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
                    model: workspace.linkedResources
                    delegate: WorkspaceButton {
                        required property var modelData
                        width: parent.width
                        text: "Open linked " + (modelData.kind === "scripts" ? "script" : "storyboard")
                        enabled: !controller.busy
                        onClicked: panel.openResource(modelData.id, modelData.kind)
                    }
                }
                WorkspaceButton { text: "Open linked script"; visible: !!document.screenplay?.script_id; enabled: !controller.busy; onClicked: panel.openResource(document.screenplay.script_id, "scripts") }
                WorkspaceButton { text: "Open linked storyboard"; visible: !!resource.storyboardId; enabled: !controller.busy; onClicked: panel.openResource(resource.storyboardId, "storyboards") }
                Repeater {
                    model: document.sections ? controller.scriptRows : []
                    delegate: Item {
                        id: line
                        required property var modelData
                        readonly property bool isSection: modelData.kind === "section"
                        readonly property bool narrow: panel.width < TimelineMetrics.trackHeaderWidth * 2
                        readonly property string speaker: modelData.speakerName || "No speaker"
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
                            Row {
                                visible: !line.isSection && line.narrow
                                spacing: Ui.Metrics.sm
                                Rectangle {
                                    width: Ui.Metrics.iconSm * 2; height: width; radius: Ui.Metrics.radiusPill
                                    color: "transparent"; border.color: Ui.Theme.statusInfo
                                    WorkspaceLabel { anchors.centerIn: parent; text: line.speaker.slice(0, 1).toUpperCase(); tone: Ui.Text.Info; role: Ui.Typography.SansBody }
                                }
                                WorkspaceLabel { anchors.verticalCenter: parent.verticalCenter; text: line.speaker.toUpperCase(); tone: Ui.Text.Info; role: Ui.Typography.SansCaption }
                            }
                            RowLayout {
                                width: parent.width
                                visible: !line.isSection
                                spacing: Ui.Metrics.lg
                                WorkspaceLabel { visible: !line.narrow; Layout.preferredWidth: Ui.Metrics.comfortable * 3; Layout.alignment: Qt.AlignTop; text: line.speaker.toUpperCase(); tone: Ui.Text.Info; role: Ui.Typography.SansCaption }
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
                            WorkspaceLabel {
                                visible: !line.isSection && text !== ""
                                text: line.modelData.status === "voiced" ? "Voiced" : line.modelData.status === "stale" ? "Voice outdated" : ""
                                tone: line.modelData.status === "voiced" ? Ui.Text.Success : Ui.Text.Warning
                                role: Ui.Typography.SansCaption
                            }
                            WorkspaceLabel { width: parent.width; visible: !!line.modelData.draftOrphan; text: "This line was removed remotely. Copy its text before discarding the draft."; tone: Ui.Text.Warning }
                            WorkspaceButton { objectName: "workspaceSaveLine_" + line.modelData.id; visible: line.lineDirty; text: "Save line"; primary: true; enabled: !controller.busy && !workspace.dirty && !line.modelData.draftOrphan; onClicked: controller.saveScriptLineDraft(line.modelData.scriptId, line.modelData.id) }
                        }
                    }
                }
                WorkspaceButton { text: "Add line"; visible: !!document.sections; enabled: !controller.busy && !controller.scriptDirty && !workspace.dirty; onClicked: controller.addScriptLine() }
                Flow {
                    id: shotGrid
                    objectName: "workspaceShotGrid"
                    width: parent.width
                    spacing: Ui.Metrics.md
                    Repeater {
                        model: document.shots || []
                        delegate: Ui.Surface {
                            id: shot
                            required property var modelData
                            required property int index
                            readonly property bool editing: panel.selectedShotId === modelData.id
                            readonly property var mediaRef: modelData.keyframe && (modelData.keyframe.uri || modelData.keyframe.asset_id) ? modelData.keyframe : modelData.clip || ({})
                            readonly property string mediaKey: panel.mediaId(mediaRef)
                            readonly property bool nearViewport: {
                                const top = shotGrid.y + shot.y
                                const offset = scroll.contentItem ? scroll.contentItem.contentY || 0 : 0
                                return top + shot.height >= offset - scroll.height && top <= offset + 2 * scroll.height
                            }
                            width: shotGrid.width >= TimelineMetrics.trackHeaderWidth * 2 ? (shotGrid.width - shotGrid.spacing) / 2 : shotGrid.width
                            height: shotContent.implicitHeight
                            selected: editing
                            clip: true
                            function loadThumbnail() { if (nearViewport && panel.mediaBrowser && mediaKey) panel.mediaBrowser.requestThumbnail(mediaKey) }
                            Component.onCompleted: loadThumbnail()
                            onMediaKeyChanged: loadThumbnail()
                            onNearViewportChanged: { if (nearViewport) loadThumbnail() }
                            Column {
                                id: shotContent
                                width: parent.width
                                spacing: Ui.Metrics.none
                                Ui.Surface {
                                    variant: Ui.Surface.Canvas
                                    width: parent.width
                                    height: width / panel.shotRatio()
                                    Image {
                                        id: shotImage
                                        objectName: "workspaceShotThumbnail_" + shot.modelData.id
                                        anchors.fill: parent
                                        source: shot.nearViewport ? panel.thumbnail(shot.mediaRef) : ""
                                        sourceSize: Qt.size(shot.width * 2, height * 2)
                                        asynchronous: true
                                        fillMode: Image.PreserveAspectCrop
                                    }
                                    WorkspaceLabel { anchors.centerIn: parent; visible: shotImage.status !== Image.Ready; text: shotImage.status === Image.Loading || (shot.mediaKey && panel.mediaBrowser && panel.mediaBrowser.busy) ? "Loading image…" : "No image" }
                                }
                                Column {
                                    x: Ui.Metrics.lg
                                    width: parent.width - 2 * Ui.Metrics.lg
                                    topPadding: Ui.Metrics.lg
                                    bottomPadding: Ui.Metrics.lg
                                    spacing: Ui.Metrics.sm
                                    RowLayout {
                                        width: parent.width
                                        WorkspaceLabel {
                                            Layout.fillWidth: true
                                            text: (panel.sceneName(shot.modelData) ? panel.sceneName(shot.modelData) + " | " : "") + "Shot " + (shot.index + 1)
                                            role: Ui.Typography.SansCaption
                                        }
                                        WorkspaceLabel { text: (Math.round((shot.modelData.duration_seconds || 0) * 10) / 10) + " s"; visible: (shot.modelData.duration_seconds || 0) > 0; role: Ui.Typography.SansCaption }
                                    }
                                    WorkspaceLabel {
                                        width: parent.width
                                        text: shot.modelData.action || "No description"
                                        tone: Ui.Text.Primary
                                        maximumLineCount: 2
                                        elide: Text.ElideRight
                                    }
                                    WorkspaceButton {
                                        objectName: "workspaceEditShot_" + shot.modelData.id
                                        text: shot.editing ? "Close editor" : "Edit shot"
                                        quiet: true
                                        enabled: !controller.busy
                                        onClicked: panel.selectedShotId = shot.editing ? "" : shot.modelData.id
                                    }
                                    Column {
                                        width: parent.width
                                        visible: shot.editing
                                        spacing: Ui.Metrics.sm
                                        Repeater {
                                            model: [{key:"action",label:"Description"}, {key:"motion",label:"Motion"}, {key:"end_state",label:"End state"}, {key:"sound",label:"Sound"}, {key:"dialogue",label:"Dialogue"}]
                                            delegate: Column {
                                                id: shotField
                                                required property var modelData
                                                width: parent.width
                                                spacing: Ui.Metrics.sm
                                                WorkspaceLabel { text: shotField.modelData.label }
                                                WorkspaceArea {
                                                    objectName: "workspaceShot_" + shotField.modelData.key
                                                    width: parent.width
                                                    value: shot.modelData[shotField.modelData.key] || ""
                                                    Accessible.name: shotField.modelData.label
                                                    enabled: !controller.busy
                                                    onTextEdited: workspace.patchShot(shot.modelData.id, shotField.modelData.key, text)
                                                }
                                            }
                                        }
                                        WorkspaceCheckBox { id: shotDetails; text: "Camera and references" }
                                        Column {
                                            width: parent.width
                                            visible: shotDetails.checked
                                            spacing: Ui.Metrics.sm
                                            Repeater {
                                                model: [{key:"framing",label:"Framing"}, {key:"angle",label:"Angle"}, {key:"movement",label:"Camera movement"}, {key:"lens",label:"Lens"}]
                                                delegate: Column {
                                                    id: cameraField
                                                    required property var modelData
                                                    width: parent.width
                                                    spacing: Ui.Metrics.sm
                                                    WorkspaceLabel { text: cameraField.modelData.label }
                                                    WorkspaceField { width: parent.width; value: (shot.modelData.camera || {})[cameraField.modelData.key] || ""; Accessible.name: cameraField.modelData.label; enabled: !controller.busy; onTextEdited: workspace.patchShot(shot.modelData.id, "camera." + cameraField.modelData.key, text) }
                                                }
                                            }
                                            WorkspaceLabel { text: "Entity IDs" }
                                            WorkspaceArea { width: parent.width; value: workspace.jsonDraft(shot.modelData.id, "entity_ids", shot.modelData.entity_ids || []); Accessible.name: "Shot entity IDs"; enabled: !controller.busy; onTextEdited: workspace.setJsonDraft(shot.modelData.id, "entity_ids", text) }
                                            WorkspaceLabel { text: "Media references" }
                                            WorkspaceArea { width: parent.width; value: workspace.jsonDraft(shot.modelData.id, "production.references", (shot.modelData.production || {}).references || []); Accessible.name: "Media references"; enabled: !controller.busy; onTextEdited: workspace.setJsonDraft(shot.modelData.id, "production.references", text) }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
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
                WorkspaceCheckBox { id: metadata; text: "Document details"; visible: !!resource.id }
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
                            WorkspaceField { width: parent.width; value: speaker.modelData.name || ""; placeholderText: "Character name"; Accessible.name: "Character name"; enabled: !controller.busy && !controller.scriptDirty; onTextEdited: workspace.patchSpeaker(speaker.modelData.id, "name", text) }
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

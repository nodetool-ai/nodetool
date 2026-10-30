import QtQuick
import QtQuick.Controls
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.Timeline

Rectangle {
    id: panel
    color: Theme.backgroundDefault
    objectName: "storyWorkspaceEditor"
    required property var controller
    required property var workspace
    property string kind: "scripts"
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
    clip: true

    function browse(nextKind) {
        kind = nextKind
        documentSearch.clear()
        selectedShotId = ""
        controller.listContextResources(kind, linked.checked)
    }
    function openResource(id, nextKind) {
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

    component DocumentGlyph: Rectangle {
        property bool board: false
        width: Theme.iconSm
        height: Theme.iconSm
        radius: Theme.radiusXs
        color: "transparent"
        border.color: board ? Theme.primary : Theme.warning
        Repeater {
            model: parent.board ? 4 : 3
            Rectangle {
                required property int index
                width: parent.board ? Theme.spacingXs : parent.width - 2 * Theme.spacingXs
                height: parent.board ? Theme.spacingXs : 1
                x: parent.board ? Theme.spacingMicro + (index % 2) * Theme.spacingSm : Theme.spacingXs
                y: parent.board ? Theme.spacingMicro + Math.floor(index / 2) * Theme.spacingSm : Theme.spacingXs + index * Theme.spacingXs
                color: parent.board ? Theme.primary : Theme.warning
            }
        }
    }

    component WorkspaceButton: Basic.Button {
        id: button
        property bool primary: false
        property bool leftAligned: false
        property bool quiet: false
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        font.weight: Font.Medium
        padding: Theme.spacingMd
        implicitHeight: Theme.toolbarHeight
        Accessible.name: text
        contentItem: Text {
            text: button.text
            font: button.font
            color: button.enabled ? Theme.textPrimary : Theme.textDisabled
            horizontalAlignment: button.leftAligned ? Text.AlignLeft : Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        background: Rectangle {
            color: button.primary && button.enabled ? Theme.primary : button.down ? Theme.actionSelected : button.hovered ? Theme.actionHover : button.quiet ? "transparent" : Theme.backgroundPaper
            border.color: button.activeFocus ? Theme.primary : button.quiet ? "transparent" : Theme.divider
            radius: Theme.radiusSm
        }
    }
    component WorkspaceLabel: Text {
        color: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        wrapMode: Text.WordWrap
    }
    component WorkspaceField: Basic.TextField {
        id: field
        color: Theme.textPrimary
        placeholderTextColor: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        padding: Theme.spacingMd
        implicitHeight: Theme.toolbarHeight
        selectByMouse: true
        background: Rectangle {
            color: Theme.backgroundPaper
            radius: Theme.radiusSm
            border.color: field.activeFocus ? Theme.primary : Theme.divider
        }
    }
    component WorkspaceArea: Basic.TextArea {
        id: field
        color: Theme.textPrimary
        placeholderTextColor: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        padding: Theme.spacingMd
        property bool quiet: false
        implicitHeight: Math.max(Theme.toolbarHeight, contentHeight + topPadding + bottomPadding)
        wrapMode: TextEdit.Wrap
        selectByMouse: true
        background: Rectangle {
            color: field.quiet && !field.hovered && !field.activeFocus ? "transparent" : Theme.backgroundPaper
            radius: Theme.radiusSm
            border.color: field.activeFocus ? Theme.primary : field.quiet && !field.hovered ? "transparent" : Theme.divider
        }
    }
    component WorkspaceCheckBox: Basic.CheckBox {
        id: control
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
        spacing: Theme.spacingSm
        padding: 0
        implicitHeight: Theme.toolbarHeight
        indicator: Rectangle {
            x: control.leftPadding
            y: (control.height - height) / 2
            width: Theme.iconSm
            height: Theme.iconSm
            radius: Theme.radiusXs
            color: control.checked ? Theme.primary : Theme.backgroundPaper
            border.color: control.activeFocus ? Theme.primary : Theme.divider
            Text { anchors.centerIn: parent; text: "✓"; visible: control.checked; color: Theme.textPrimary; font.pixelSize: Theme.fontSizeSmaller }
        }
        contentItem: Text {
            text: control.text
            font: control.font
            color: control.enabled ? Theme.textSecondary : Theme.textDisabled
            leftPadding: control.indicator.width + control.spacing
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Theme.spacingLg
        spacing: Theme.spacingSm
        RowLayout {
            Layout.fillWidth: true
            spacing: Theme.spacingSm
            Basic.ComboBox {
                id: documentSelector
                objectName: "workspaceDocumentKind"
                Layout.fillWidth: true
                implicitHeight: Theme.toolbarHeight
                model: ["Scripts", "Storyboards"]
                currentIndex: panel.kind === "storyboards" || (panel.kind === "entities" && panel.returnKind === "storyboards") ? 1 : 0
                Accessible.name: "Document type"
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
                palette.button: Theme.backgroundPaper
                palette.buttonText: Theme.textPrimary
                palette.base: Theme.backgroundPaper
                palette.text: Theme.textPrimary
                palette.window: Theme.backgroundPaper
                palette.windowText: Theme.textPrimary
                palette.highlight: Theme.primary
                enabled: !controller.busy
                onActivated: index => panel.browse(index === 1 ? "storyboards" : "scripts")
                background: Rectangle {
                    color: Theme.backgroundPaper
                    border.color: documentSelector.activeFocus ? Theme.primary : Theme.divider
                    radius: Theme.radiusSm
                }
                contentItem: Text {
                    text: documentSelector.displayText
                    color: Theme.textPrimary
                    font: documentSelector.font
                    leftPadding: Theme.spacingMd
                    rightPadding: documentSelector.indicator.width + Theme.spacingLg
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                }
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
            color: Theme.error
            Accessible.role: Accessible.AlertMessage
        }
        WorkspaceLabel { visible: controller.busy; text: "Loading documents…" }
        ColumnLayout {
            Layout.fillWidth: true
            visible: !!resource.id
            spacing: Theme.spacingSm
            RowLayout {
                Layout.fillWidth: true
                DocumentGlyph { board: panel.documentKind === "storyboards"; visible: panel.kind !== "entities" }
                WorkspaceLabel {
                    Layout.fillWidth: true
                    text: resource.name || (resource.metadata || {}).nodetool_entity?.name || (panel.documentKind === "scripts" ? "Untitled script" : "Untitled storyboard")
                    color: Theme.textPrimary
                    font.pixelSize: Theme.fontSizeNormal
                    font.weight: Font.DemiBold
                }
                WorkspaceLabel { text: workspace.dirty || controller.scriptDirty ? "Edited" : "Saved"; font.pixelSize: Theme.fontSizeSmaller; color: workspace.dirty || controller.scriptDirty ? Theme.warning : Theme.textSecondary }
            }
            WorkspaceLabel {
                text: document.shots ? document.shots.length + (document.shots.length === 1 ? " shot" : " shots") : panel.scriptStats.lines + (panel.scriptStats.lines === 1 ? " line · " : " lines · ") + panel.scriptStats.words + (panel.scriptStats.words === 1 ? " word" : " words")
                visible: panel.kind !== "entities"
                font.pixelSize: Theme.fontSizeSmaller
            }
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.divider }
        }
        ScrollView {
            id: scroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            contentWidth: availableWidth
            Column {
                width: scroll.availableWidth
                spacing: Theme.spacingMd
                Column {
                    width: parent.width
                    spacing: Theme.spacingSm
                    visible: !resource.id
                    WorkspaceLabel {
                        width: parent.width
                        text: documentSelector.currentText
                        color: Theme.textPrimary
                        font.pixelSize: Theme.fontSizeNormal
                        font.weight: Font.DemiBold
                    }
                    WorkspaceLabel {
                        width: parent.width
                        objectName: "workspaceListMessage"
                        visible: !controller.busy && panel.resourceList.length === 0
                        text: documentSearch.text.trim() ? "No matching " + panel.kind + ". Try a different search." : panel.showingList ? "No documents in this context. Try another document type or turn off the linked filter." : "Browse your project's scripts and storyboards. Open a server timeline to load your documents."
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
                        spacing: Theme.spacingXs
                        WorkspaceLabel {
                            width: parent.width
                            visible: modelData.showGroup && modelData.dateGroup !== ""
                            text: modelData.dateGroup.toUpperCase()
                            font.pixelSize: Theme.fontSizeSmaller
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
                            contentItem: RowLayout {
                                spacing: Theme.spacingSm
                                DocumentGlyph { board: panel.kind === "storyboards" }
                                Text { Layout.fillWidth: true; text: documentRow.text; color: Theme.textPrimary; font: documentRow.font; elide: Text.ElideRight }
                            }
                        }
                    }
                }
                Column {
                    width: parent.width
                    spacing: Theme.spacingSm
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
                    delegate: Rectangle {
                        id: line
                        required property var modelData
                        readonly property bool isSection: modelData.kind === "section"
                        readonly property bool narrow: panel.width < Theme.trackHeaderWidth * 2
                        readonly property string speaker: modelData.speakerName || "No speaker"
                        readonly property bool lineDirty: { controller.scriptDraftRevision; return controller.hasScriptLineDraft(modelData.scriptId || "", modelData.id || "") }
                        width: parent.width
                        height: lineContent.implicitHeight + (isSection ? Theme.spacingSm : 2 * Theme.spacingLg)
                        color: isSection ? "transparent" : Theme.backgroundPaper
                        radius: Theme.radiusMd
                        border.color: isSection ? "transparent" : Theme.divider
                        Column {
                            id: lineContent
                            x: line.isSection ? 0 : Theme.spacingLg
                            y: line.isSection ? 0 : Theme.spacingLg
                            width: parent.width - (line.isSection ? 0 : 2 * Theme.spacingLg)
                            spacing: Theme.spacingSm
                            WorkspaceLabel {
                                width: parent.width
                                visible: line.isSection
                                text: (line.modelData.title || "Untitled section").toUpperCase()
                                font.pixelSize: Theme.fontSizeSmaller
                                font.weight: Font.Medium
                            }
                            Row {
                                visible: !line.isSection && line.narrow
                                spacing: Theme.spacingSm
                                Rectangle {
                                    width: Theme.iconSm * 2; height: width; radius: width / 2
                                    color: "transparent"; border.color: Theme.info
                                    WorkspaceLabel { anchors.centerIn: parent; text: line.speaker.slice(0, 1).toUpperCase(); color: Theme.info; font.pixelSize: Theme.fontSizeNormal }
                                }
                                WorkspaceLabel { anchors.verticalCenter: parent.verticalCenter; text: line.speaker.toUpperCase(); color: Theme.info; font.pixelSize: Theme.fontSizeSmaller }
                            }
                            RowLayout {
                                width: parent.width
                                visible: !line.isSection
                                spacing: Theme.spacingLg
                                WorkspaceLabel { visible: !line.narrow; Layout.preferredWidth: Theme.toolbarHeight * 3; Layout.alignment: Qt.AlignTop; text: line.speaker.toUpperCase(); color: Theme.info; font.pixelSize: Theme.fontSizeSmaller }
                                WorkspaceArea {
                                    Layout.fillWidth: true
                                    objectName: "workspaceScriptLine_" + line.modelData.id
                                    quiet: true
                                    padding: Theme.spacingSm
                                    font.pixelSize: Theme.fontSizeNormal
                                    enabled: !controller.busy && !workspace.dirty
                                    text: line.modelData.text || ""
                                    placeholderText: "Write a line…"
                                    Accessible.name: "Script line"
                                    onTextEdited: controller.setScriptLineDraft(line.modelData.scriptId, line.modelData.id, text)
                                }
                            }
                            WorkspaceLabel {
                                visible: !line.isSection && text !== ""
                                text: line.modelData.status === "voiced" ? "Voiced" : line.modelData.status === "stale" ? "Voice outdated" : ""
                                color: line.modelData.status === "voiced" ? Theme.success : Theme.warning
                                font.pixelSize: Theme.fontSizeSmaller
                            }
                            WorkspaceLabel { width: parent.width; visible: !!line.modelData.draftOrphan; text: "This line was removed remotely. Copy its text before discarding the draft."; color: Theme.warning }
                            WorkspaceButton { objectName: "workspaceSaveLine_" + line.modelData.id; visible: line.lineDirty; text: "Save line"; primary: true; enabled: !controller.busy && !workspace.dirty && !line.modelData.draftOrphan; onClicked: controller.saveScriptLineDraft(line.modelData.scriptId, line.modelData.id) }
                        }
                    }
                }
                WorkspaceButton { text: "Add line"; visible: !!document.sections; enabled: !controller.busy && !controller.scriptDirty && !workspace.dirty; onClicked: controller.addScriptLine() }
                Flow {
                    id: shotGrid
                    objectName: "workspaceShotGrid"
                    width: parent.width
                    spacing: Theme.spacingMd
                    Repeater {
                        model: document.shots || []
                        delegate: Rectangle {
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
                            width: shotGrid.width >= Theme.trackHeaderWidth * 2 ? (shotGrid.width - shotGrid.spacing) / 2 : shotGrid.width
                            height: shotContent.implicitHeight
                            radius: Theme.radiusLg
                            color: Theme.backgroundPaper
                            border.color: editing ? Theme.primary : Theme.divider
                            clip: true
                            function loadThumbnail() { if (nearViewport && panel.mediaBrowser && mediaKey) panel.mediaBrowser.requestThumbnail(mediaKey) }
                            Component.onCompleted: loadThumbnail()
                            onMediaKeyChanged: loadThumbnail()
                            onNearViewportChanged: { if (nearViewport) loadThumbnail() }
                            Column {
                                id: shotContent
                                width: parent.width
                                spacing: 0
                                Rectangle {
                                    width: parent.width
                                    height: width / panel.shotRatio()
                                    color: Theme.backgroundDefault
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
                                    x: Theme.spacingLg
                                    width: parent.width - 2 * Theme.spacingLg
                                    topPadding: Theme.spacingLg
                                    bottomPadding: Theme.spacingLg
                                    spacing: Theme.spacingSm
                                    RowLayout {
                                        width: parent.width
                                        WorkspaceLabel {
                                            Layout.fillWidth: true
                                            text: (panel.sceneName(shot.modelData) ? panel.sceneName(shot.modelData) + " | " : "") + "Shot " + (shot.index + 1)
                                            font.pixelSize: Theme.fontSizeSmaller
                                        }
                                        WorkspaceLabel { text: (Math.round((shot.modelData.duration_seconds || 0) * 10) / 10) + " s"; visible: (shot.modelData.duration_seconds || 0) > 0; font.pixelSize: Theme.fontSizeSmaller }
                                    }
                                    WorkspaceLabel {
                                        width: parent.width
                                        text: shot.modelData.action || "No description"
                                        color: Theme.textPrimary
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
                                        spacing: Theme.spacingSm
                                        Repeater {
                                            model: [{key:"action",label:"Description"}, {key:"motion",label:"Motion"}, {key:"end_state",label:"End state"}, {key:"sound",label:"Sound"}, {key:"dialogue",label:"Dialogue"}]
                                            delegate: Column {
                                                id: shotField
                                                required property var modelData
                                                width: parent.width
                                                spacing: Theme.spacingSm
                                                WorkspaceLabel { text: shotField.modelData.label }
                                                WorkspaceArea {
                                                    objectName: "workspaceShot_" + shotField.modelData.key
                                                    width: parent.width
                                                    text: shot.modelData[shotField.modelData.key] || ""
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
                                            spacing: Theme.spacingSm
                                            Repeater {
                                                model: [{key:"framing",label:"Framing"}, {key:"angle",label:"Angle"}, {key:"movement",label:"Camera movement"}, {key:"lens",label:"Lens"}]
                                                delegate: Column {
                                                    id: cameraField
                                                    required property var modelData
                                                    width: parent.width
                                                    spacing: Theme.spacingSm
                                                    WorkspaceLabel { text: cameraField.modelData.label }
                                                    WorkspaceField { width: parent.width; text: (shot.modelData.camera || {})[cameraField.modelData.key] || ""; Accessible.name: cameraField.modelData.label; enabled: !controller.busy; onTextEdited: workspace.patchShot(shot.modelData.id, "camera." + cameraField.modelData.key, text) }
                                                }
                                            }
                                            WorkspaceLabel { text: "Entity IDs" }
                                            WorkspaceArea { width: parent.width; text: workspace.jsonDraft(shot.modelData.id, "entity_ids", shot.modelData.entity_ids || []); Accessible.name: "Shot entity IDs"; enabled: !controller.busy; onTextEdited: workspace.setJsonDraft(shot.modelData.id, "entity_ids", text) }
                                            WorkspaceLabel { text: "Media references" }
                                            WorkspaceArea { width: parent.width; text: workspace.jsonDraft(shot.modelData.id, "production.references", (shot.modelData.production || {}).references || []); Accessible.name: "Media references"; enabled: !controller.busy; onTextEdited: workspace.setJsonDraft(shot.modelData.id, "production.references", text) }
                                        }
                                    }
                                }
                            }
                            Rectangle { anchors.fill: parent; color: "transparent"; radius: Theme.radiusLg; border.color: shot.editing ? Theme.primary : Theme.divider }
                        }
                    }
                }
                Column {
                    width: parent.width
                    spacing: Theme.spacingSm
                    visible: workspace.entityIds.length > 0
                    WorkspaceLabel { text: "Characters and references"; font.weight: Font.Medium }
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
                    spacing: Theme.spacingSm
                    visible: !!marker.kind
                    Repeater {
                        model: [{key:"name",label:"Name"}, {key:"descriptor",label:"Descriptor"}, {key:"description",label:"Description"}, {key:"voice_id",label:"Voice ID"}, {key:"reference_asset_id",label:"Reference image ID"}]
                        delegate: Column {
                            id: entityField
                            required property var modelData
                            width: entity.width
                            spacing: Theme.spacingSm
                            WorkspaceLabel { text: entityField.modelData.label }
                            WorkspaceArea { width: parent.width; text: entity.marker[entityField.modelData.key] || ""; Accessible.name: entityField.modelData.label; enabled: !controller.busy; onTextEdited: workspace.patchEntity(entityField.modelData.key, text === "" && entityField.modelData.key === "reference_asset_id" ? null : text) }
                        }
                    }
                }
                WorkspaceCheckBox { id: metadata; text: "Document details"; visible: !!resource.id }
                Column {
                    width: parent.width
                    spacing: Theme.spacingSm
                    visible: metadata.visible && metadata.checked
                    WorkspaceLabel { width: parent.width; text: resource.id || ""; font.family: Theme.monoFamily; wrapMode: Text.WrapAnywhere }
                    Repeater {
                        model: document.cast || []
                        delegate: Column {
                            id: speaker
                            required property var modelData
                            width: parent.width
                            spacing: Theme.spacingSm
                            WorkspaceField { width: parent.width; text: speaker.modelData.name || ""; placeholderText: "Character name"; Accessible.name: "Character name"; enabled: !controller.busy && !controller.scriptDirty; onTextEdited: workspace.patchSpeaker(speaker.modelData.id, "name", text) }
                            WorkspaceField { width: parent.width; text: speaker.modelData.entityId || ""; placeholderText: "Character entity ID"; Accessible.name: "Character entity ID"; enabled: !controller.busy && !controller.scriptDirty; onTextEdited: workspace.patchSpeaker(speaker.modelData.id, "entityId", text === "" ? null : text) }
                        }
                    }
                    WorkspaceArea { width: parent.width; visible: document.shots !== undefined; text: workspace.jsonDraft("", "entityIds", document.entityIds || []); Accessible.name: "Storyboard entity IDs"; enabled: !controller.busy; onTextEdited: workspace.setJsonDraft("", "entityIds", text) }
                }
            }
        }
        ColumnLayout {
            Layout.fillWidth: true
            visible: workspace.dirty || controller.scriptDirty
            spacing: Theme.spacingSm
            Rectangle { Layout.fillWidth: true; implicitHeight: 1; color: Theme.divider }
            WorkspaceLabel {
                Layout.fillWidth: true
                text: workspace.dirty ? "Unsaved document changes" : "Unsaved script lines. Save each edited line."
                color: Theme.warning
            }
            RowLayout {
                Layout.fillWidth: true
                spacing: Theme.spacingSm
                WorkspaceButton { Layout.fillWidth: true; text: "Save document"; objectName: "workspaceSave"; primary: true; visible: workspace.dirty; enabled: !controller.busy; onClicked: workspace.save() }
                WorkspaceButton {
                    Layout.fillWidth: true
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
    Dialog {
        id: lineDiscardDialog
        title: "Discard unsaved script lines?"
        property string scriptId: ""
        modal: true
        standardButtons: Dialog.Discard | Dialog.Cancel
        onDiscarded: controller.discardScriptDrafts(scriptId)
    }
    Dialog {
        id: discardDialog
        title: "Discard document changes?"
        modal: true
        standardButtons: Dialog.Discard | Dialog.Cancel
        onDiscarded: workspace.discard()
    }
}

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "shotDraft.js" as Draft

// The storyboard: a toolbar over a grid of shot cards grouped under scene headers, the board
// settings, and the selected shot's inspector under the grid. A port of web StoryboardBoard.
// A structural edit (add, insert, duplicate, move, delete) and a settings change save at once.
Item {
    id: board
    objectName: "storyboardBoard"
    required property var workspace
    required property var controller
    // A ShotWorkflow: renders and the prompt preview.
    required property var renders
    property var mediaBrowser: null
    property bool readOnly: false
    signal editShotRequested(string shotId)
    signal entityRequested(string entityId)
    signal scriptRequested(string scriptId)

    readonly property var resource: workspace.resource || ({})
    readonly property var document: resource.document || ({})
    readonly property var shots: document.shots || []
    readonly property var scenes: (document.screenplay || {}).scenes || []
    readonly property var groups: Draft.sceneOrder(shots).map((group, index) => ({
        sceneId: group.sceneId, number: index + 1, shots: group.shots,
        slugline: (scenes.find(scene => scene.id === group.sceneId) || {}).slugline || ""
    }))
    readonly property var ordered: groups.reduce((list, group) => list.concat(group.shots), [])
    readonly property var captions: {
        const result = {}
        for (const group of groups) group.shots.forEach((shot, index) => result[shot.id] = "Scene " + group.number + " | Shot " + (index + 1))
        return result
    }
    readonly property bool searching: query.trim() !== ""
    readonly property var visibleGroups: {
        const words = query.toLowerCase().split(/\s+/).filter(word => word !== "")
        if (words.length === 0) return groups
        return groups.map(group => Object.assign({}, group, {shots: group.shots.filter(shot => {
            const text = [captions[shot.id], shot.slug, shot.action, shot.dialogue, shot.narration, shot.motion, shot.end_state,
                          shot.sound, shot.notes, shot.script_text_snapshot, group.slugline].filter(part => typeof part === "string" && part !== "").join("\n").toLowerCase()
            return words.every(word => text.includes(word))
        })})).filter(group => group.shots.length > 0)
    }
    readonly property int visibleCount: visibleGroups.reduce((count, group) => count + group.shots.length, 0)
    readonly property var activeShot: shots.find(shot => shot.id === selectedShotId) || null
    readonly property var pendingStills: shots.filter(shot => (shot.render_mode || "keyframe") === "keyframe" && !shot.keyframe && !Draft.isGenerating(shot))
    readonly property var pendingClips: shots.filter(shot => !shot.clip && !Draft.isGenerating(shot) && ((shot.render_mode || "keyframe") !== "keyframe" || !!shot.keyframe))
    readonly property real ratio: {
        const parts = (document.aspectRatio || "16:9").split(":").map(Number)
        return parts.length === 2 && parts[0] > 0 && parts[1] > 0 ? parts[0] / parts[1] : 16 / 9
    }
    readonly property string summary: {
        const names = (document.entityIds || []).map(id => entityName(id)).filter(name => name !== "")
        return [shots.length + (shots.length === 1 ? " shot" : " shots"),
                (document.style || "").trim() !== "" ? document.style.trim() + " style" : "",
                names.length > 0 ? "entity: " + names.join(", ") : ""].filter(part => part !== "").join(" · ")
    }

    property string query: ""
    property string selectedShotId: ""
    property bool settingsOpen: shots.length === 0
    property bool stillsOnly: false
    // The minimum card width in characters, as the web size slider.
    property int cardSize: 36
    property string dragShotId: ""
    property string dropTargetId: ""
    property var renderQueue: []
    property string renderQueueKind: ""
    property var renderQueueModel: null
    property string deleteShotId: ""

    function entityName(id) {
        if (!mediaBrowser) return ""
        mediaBrowser.requestThumbnail(id)
        return (mediaBrowser.details[id] || {}).name || ""
    }
    // A committed act: write it into the draft and save at once.
    function commit(changed) { if (changed) workspace.save() }
    function addShot(afterShotId) {
        const id = workspace.insertShot(afterShotId || "")
        if (id !== "") { selectedShotId = id; workspace.save() }
    }
    function duplicate(shotId) {
        const id = workspace.duplicateShot(shotId)
        if (id !== "") { selectedShotId = id; workspace.save() }
    }
    function remove(shotId) {
        if (selectedShotId === shotId) selectedShotId = ""
        commit(workspace.removeShot(shotId))
    }
    function nudge(shotId, direction) { commit(workspace.nudgeShot(shotId, direction)) }
    function setBoard(field, value) { commit(workspace.patchBoard(field, value)) }
    function select(shotId) { selectedShotId = selectedShotId === shotId ? "" : shotId }
    function step(delta) {
        const list = visibleGroups.reduce((all, group) => all.concat(group.shots), [])
        if (list.length === 0) return
        const at = list.findIndex(shot => shot.id === selectedShotId)
        selectedShotId = list[Math.max(0, Math.min(list.length - 1, at < 0 ? 0 : at + delta))].id
    }

    // Renders read the saved board, so each waits until no save is open.
    function openRender(kind, shotIds) {
        renderDialog.active = true
        const first = shots.find(shot => shot.id === shotIds[0]) || {}
        const mode = kind === "image" ? "image" : (first.render_mode || "keyframe") === "keyframe" ? "image_to_video" : "video"
        renderDialog.shotIds = shotIds
        renderDialog.item.openFor(kind, mode, kind === "image" ? first.still_model : first.clip_model)
    }
    function startQueue(kind, model, shotIds) {
        renderQueueKind = kind
        renderQueueModel = model
        renderQueue = shotIds
        runQueue()
    }
    function runQueue() {
        if (renderQueue.length === 0 || renders.busy || workspace.dirty || controller.busy) return
        const next = renderQueue[0]
        renderQueue = renderQueue.slice(1)
        renders.render(controller.result, next, renderQueueKind, renderQueueModel)
    }
    Connections {
        target: board.controller
        function onChanged() { if (board.renderQueue.length > 0) Qt.callLater(board.runQueue) }
    }
    Connections {
        target: board.renders
        function onStateChanged() {
            if (board.renders.state === "failed" || board.renders.state === "cancelled") board.renderQueue = []
            else if (board.renderQueue.length > 0) Qt.callLater(board.runQueue)
        }
    }

    // Drag to reorder: the card under the pointer is the drop target, and the shot lands at its place.
    readonly property var cardItems: ({})
    function dragTo(point) {
        let target = ""
        for (const id in cardItems) {
            const item = cardItems[id]
            if (!item || id === dragShotId) continue
            const local = item.mapFromItem(null, point.x, point.y)
            if (local.x >= 0 && local.y >= 0 && local.x <= item.width && local.y <= item.height) { target = id; break }
        }
        dropTargetId = target
    }
    function dropDragged() {
        const target = shots.find(shot => shot.id === dropTargetId)
        if (target && dragShotId !== "") {
            const group = groups.find(entry => entry.shots.some(shot => shot.id === target.id))
            commit(workspace.moveShot(dragShotId, target.scene_id || "", group.shots.findIndex(shot => shot.id === target.id)))
        }
        dragShotId = ""
        dropTargetId = ""
    }

    Loader {
        id: renderDialog
        property var shotIds: []
        active: false
        source: "ShotRenderDialog.qml"
        onLoaded: item.renderRequested.connect((kind, model) => board.startQueue(kind, model, renderDialog.shotIds))
    }
    ShotMediaViewer {
        id: viewer
        shots: board.shots
        mediaBrowser: board.mediaBrowser
        timeline: board.controller.timeline
    }
    Ui.Dialog {
        id: deleteDialog
        objectName: "shotDeleteDialog"
        title: "Delete shot?"
        width: Math.min(Ui.Metrics.dialogWidth, board.width)
        readonly property var target: board.shots.find(shot => shot.id === board.deleteShotId) || null
        contentItem: ColumnLayout {
            Ui.Text {
                Layout.fillWidth: true
                wrapMode: Text.Wrap
                text: "Remove “" + (deleteDialog.target ? (deleteDialog.target.index + 1) + ". " + (deleteDialog.target.slug || "Untitled shot") : "")
                    + "” from the board. Generated stills and clips stay in your asset library."
            }
        }
        footer: RowLayout {
            spacing: Ui.Metrics.sm
            Item { Layout.fillWidth: true }
            Ui.EditorButton { Layout.bottomMargin: Ui.Metrics.xl; text: "Cancel"; onClicked: deleteDialog.close() }
            Ui.EditorButton {
                objectName: "shotDeleteConfirm"
                Layout.bottomMargin: Ui.Metrics.xl
                Layout.rightMargin: Ui.Metrics.xl
                variant: Ui.EditorButton.Destructive
                text: "Delete"
                onClicked: { deleteDialog.close(); board.remove(board.deleteShotId) }
            }
        }
    }
    function confirmDelete(shotId) { deleteShotId = shotId; deleteDialog.open() }

    Flickable {
        id: scroll
        objectName: "storyboardScroll"
        anchors.fill: parent
        clip: true
        contentWidth: width
        contentHeight: content.implicitHeight + 2 * Ui.Metrics.xl
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar {}
        readonly property bool compact: width < Ui.Metrics.touch * 14

        ColumnLayout {
            id: content
            x: scroll.compact ? Ui.Metrics.md : Ui.Metrics.xl
            y: scroll.compact ? Ui.Metrics.md : Ui.Metrics.xl
            width: scroll.width - 2 * x
            spacing: scroll.compact ? Ui.Metrics.md : Ui.Metrics.lg

            // The board, then the work on it.
            RowLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.lg
                Ui.Text {
                    objectName: "storyboardTitle"
                    Layout.fillWidth: true
                    text: board.resource.name || "Untitled film"
                    role: Ui.Typography.SansTitle
                    elide: Text.ElideRight
                }
                Ui.EditorButton {
                    objectName: "storyboardSettingsToggle"
                    visible: !board.readOnly
                    iconName: "tune"
                    variant: board.settingsOpen ? Ui.EditorButton.Primary : Ui.EditorButton.Default
                    text: "Board settings"
                    Accessible.expandable: true
                    Accessible.expanded: board.settingsOpen
                    onClicked: board.settingsOpen = !board.settingsOpen
                }
            }
            Ui.Text { Layout.fillWidth: true; text: board.summary; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; wrapMode: Text.Wrap }
            Flow {
                Layout.fillWidth: true
                visible: board.shots.length > 0 || !board.readOnly
                spacing: Ui.Metrics.md
                Ui.EditorButton {
                    objectName: "storyboardSlideshow"
                    visible: board.shots.length > 0
                    iconName: "playArrow"
                    text: "Slideshow"
                    enabled: board.ordered.some(shot => !!shot.keyframe)
                    onClicked: viewer.openTake("image", (board.ordered.find(shot => !!shot.keyframe) || {}).keyframe)
                }
                Ui.EditorButton {
                    objectName: "storyboardRenderStills"
                    visible: !board.readOnly
                    iconName: "autoAwesome"
                    text: "Render stills"
                    enabled: board.pendingStills.length > 0 && !board.renders.busy && board.renderQueue.length === 0
                    onClicked: board.openRender("image", board.pendingStills.map(shot => shot.id))
                }
                Ui.EditorButton {
                    objectName: "storyboardRenderClips"
                    visible: !board.readOnly
                    iconName: "movieOutlined"
                    text: "Render clips"
                    enabled: board.pendingClips.length > 0 && !board.renders.busy && board.renderQueue.length === 0
                    onClicked: board.openRender("video", board.pendingClips.map(shot => shot.id))
                }
                Ui.EditorButton {
                    objectName: "storyboardStopRenders"
                    visible: board.renderQueue.length > 0 || board.renders.busy
                    iconName: "stop"
                    text: board.renderQueue.length > 0 ? "Stop (" + board.renderQueue.length + " waiting)" : "Stop render"
                    onClicked: { board.renderQueue = []; board.renders.cancel() }
                }
            }
            Ui.Text {
                Layout.fillWidth: true
                visible: text !== ""
                text: board.renders.error || board.workspace.error || ""
                tone: Ui.Text.Error
                role: Ui.Typography.SansLabel
                wrapMode: Text.Wrap
            }

            // Board settings: the screenplay fields and the direction.
            Rectangle {
                objectName: "storyboardSettings"
                Layout.fillWidth: true
                visible: board.settingsOpen && !board.readOnly
                implicitHeight: settings.implicitHeight + 2 * Ui.Metrics.xl
                radius: Ui.Metrics.radiusCard
                color: Ui.Theme.surfacePanel
                border.width: Ui.Metrics.border
                border.color: Ui.Theme.borderSubtle
                ColumnLayout {
                    id: settings
                    x: Ui.Metrics.xl
                    y: Ui.Metrics.xl
                    width: parent.width - 2 * Ui.Metrics.xl
                    spacing: Ui.Metrics.xl
                    RowLayout {
                        Layout.fillWidth: true
                        Ui.Text { Layout.fillWidth: true; text: "Board settings"; role: Ui.Typography.SansTitle }
                        Ui.ToolbarIconButton { iconName: "close"; text: "Close board settings"; onClicked: board.settingsOpen = false }
                    }
                    GridLayout {
                        Layout.fillWidth: true
                        columns: width < Ui.Metrics.touch * 14 ? 1 : 2
                        columnSpacing: Ui.Metrics.xl
                        rowSpacing: Ui.Metrics.xl
                        ColumnLayout {
                            Layout.fillWidth: true
                            Layout.preferredWidth: 2
                            Layout.alignment: Qt.AlignTop
                            spacing: Ui.Metrics.md
                            Ui.Text { text: "Screenplay"; role: Ui.Typography.SansCaption; tone: Ui.Text.Disabled; font.capitalization: Font.AllUppercase }
                            Ui.Text { text: "Title"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                            Ui.TextField {
                                objectName: "storyboardTitleField"
                                Layout.fillWidth: true
                                value: board.resource.name || ""
                                placeholderText: "Untitled film"
                                accessibleName: "Title"
                                onValueCommitted: next => board.setBoard("name", next)
                            }
                            Ui.Text { text: "Brief"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                            Ui.TextArea {
                                objectName: "storyboardBriefField"
                                Layout.fillWidth: true
                                Layout.minimumHeight: Ui.Metrics.touch * 2
                                value: board.document.brief || ""
                                placeholderText: "Describe the film you want to make."
                                accessibleName: "Brief"
                                onValueCommitted: next => board.setBoard("brief", next)
                            }
                            Ui.Text { text: "Visual style"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                            Ui.TextField {
                                objectName: "storyboardStyleField"
                                Layout.fillWidth: true
                                value: board.document.style || ""
                                placeholderText: "Describe the visual style."
                                accessibleName: "Visual style"
                                onValueCommitted: next => board.setBoard("style", next)
                            }
                            Ui.Text { text: "Cast and ingredients"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                            Ui.Text {
                                visible: (board.document.entityIds || []).length === 0
                                text: "No entities yet."
                                role: Ui.Typography.SansCaption
                                tone: Ui.Text.Secondary
                            }
                            Flow {
                                Layout.fillWidth: true
                                spacing: Ui.Metrics.sm
                                Repeater {
                                    model: board.document.entityIds || []
                                    delegate: Ui.EditorButton {
                                        required property string modelData
                                        required property int index
                                        objectName: "workspaceInspectEntity"
                                        density: Ui.EditorButton.Compact
                                        text: board.entityName(modelData) || "Reference " + (index + 1)
                                        enabled: !board.controller.busy
                                        onClicked: board.entityRequested(modelData)
                                    }
                                }
                            }
                        }
                        ColumnLayout {
                            Layout.fillWidth: true
                            Layout.preferredWidth: 1
                            Layout.alignment: Qt.AlignTop
                            spacing: Ui.Metrics.md
                            Ui.Text { text: "Direction"; role: Ui.Typography.SansCaption; tone: Ui.Text.Disabled; font.capitalization: Font.AllUppercase }
                            Ui.Text { text: "Aspect ratio"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
                            Ui.Select {
                                objectName: "storyboardAspectRatio"
                                Layout.fillWidth: true
                                options: [{value: "16:9", label: "16:9 — Widescreen"}, {value: "9:16", label: "9:16 — Vertical"}, {value: "1:1", label: "1:1 — Square"},
                                          {value: "4:3", label: "4:3 — Classic"}, {value: "21:9", label: "21:9 — Cinematic"}]
                                value: board.document.aspectRatio || "16:9"
                                accessibleName: "Aspect ratio"
                                onValueCommitted: next => board.setBoard("aspectRatio", next)
                            }
                        }
                    }
                }
            }

            // The shot toolbar: what acts on the grid sits right above it.
            Flow {
                objectName: "storyboardShotToolbar"
                Layout.fillWidth: true
                visible: board.shots.length > 0 || !board.readOnly
                spacing: Ui.Metrics.md
                Ui.TextField {
                    objectName: "storyboardSearch"
                    visible: board.shots.length > 0
                    width: Math.min(content.width, Ui.Metrics.xl * 20)
                    value: board.query
                    placeholderText: "Search shots"
                    accessibleName: "Search shots by title or description"
                    onValuePreviewed: next => board.query = next
                    onValueCommitted: next => board.query = next
                }
                Ui.Text {
                    visible: board.searching
                    height: Ui.Metrics.standard
                    verticalAlignment: Text.AlignVCenter
                    text: board.visibleCount + " of " + board.shots.length + " shots"
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.EditorButton {
                    objectName: "storyboardAddShot"
                    visible: !board.readOnly
                    iconName: "add"
                    text: "Add shot"
                    onClicked: board.addShot("")
                }
                Row {
                    visible: board.shots.length > 0
                    spacing: Ui.Metrics.none
                    Accessible.role: Accessible.Grouping
                    Accessible.name: "Card media"
                    Repeater {
                        model: [{label: "Clips", stills: false}, {label: "Stills", stills: true}]
                        delegate: Ui.EditorButton {
                            required property var modelData
                            objectName: "storyboardCardMedia_" + modelData.label
                            density: Ui.EditorButton.Compact
                            text: modelData.label
                            active: board.stillsOnly === modelData.stills
                            onClicked: board.stillsOnly = modelData.stills
                        }
                    }
                }
                Row {
                    visible: board.shots.length > 0 && !scroll.compact
                    spacing: Ui.Metrics.sm
                    Ui.Text { anchors.verticalCenter: parent.verticalCenter; text: "Size"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                    Ui.Slider {
                        objectName: "storyboardCardSize"
                        anchors.verticalCenter: parent.verticalCenter
                        width: Ui.Metrics.xxxl * 4
                        from: 24
                        to: 72
                        stepSize: 4
                        value: board.cardSize
                        accessibleName: "Cards at least " + board.cardSize + " characters wide"
                        onValuePreviewed: next => board.cardSize = Math.round(next / 4) * 4
                    }
                }
            }

            Ui.EmptyState {
                objectName: "storyboardEmpty"
                Layout.fillWidth: true
                visible: board.shots.length === 0
                title: "No shots yet"
                message: board.readOnly ? "This storyboard has no shots." : "Add a shot to start your storyboard."
            }
            Ui.EmptyState {
                Layout.fillWidth: true
                visible: board.shots.length > 0 && board.visibleGroups.length === 0
                title: "No matching shots"
                message: "Try a different search."
            }

            // The grid: one block per scene, its header above its cards.
            Flow {
                id: grid
                objectName: "storyboardGrid"
                Layout.fillWidth: true
                spacing: Ui.Metrics.xl
                activeFocusOnTab: true
                Accessible.role: Accessible.Grouping
                Accessible.name: "Storyboard shots"
                Keys.onLeftPressed: board.step(-1)
                Keys.onRightPressed: board.step(1)
                Keys.onUpPressed: board.step(-cards.columns)
                Keys.onDownPressed: board.step(cards.columns)
                Keys.onReturnPressed: if (board.selectedShotId !== "" && !board.readOnly) board.editShotRequested(board.selectedShotId)
                readonly property real charWidth: Ui.Typography.pixelSize(Ui.Typography.SansBody) * 0.55
                readonly property real minCard: Math.min(width, board.cardSize * charWidth)
                QtObject { id: cards; readonly property int columns: Math.max(1, Math.floor((grid.width + grid.spacing) / (grid.minCard + grid.spacing))) }
                Repeater {
                    model: board.visibleGroups
                    delegate: ColumnLayout {
                        id: scene
                        required property var modelData
                        readonly property int columns: modelData.shots.length > 1 ? cards.columns : 1
                        objectName: "storyboardScene_" + modelData.number
                        width: modelData.shots.length > 1 ? grid.width : Math.min(grid.width, Math.max(grid.minCard, Math.min(grid.width, Math.max(80, board.cardSize) * grid.charWidth)) )
                        spacing: Ui.Metrics.xl
                        Accessible.role: Accessible.Grouping
                        Accessible.name: "Scene " + modelData.number
                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: Ui.Metrics.xs
                            RowLayout {
                                Layout.fillWidth: true
                                Layout.topMargin: Ui.Metrics.md
                                spacing: Ui.Metrics.md
                                Ui.Text { text: "Scene " + scene.modelData.number; role: Ui.Typography.MonoCaption; tone: Ui.Text.Secondary; Accessible.role: Accessible.Heading }
                                Ui.Text { Layout.fillWidth: true; visible: text !== ""; text: scene.modelData.slugline; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; elide: Text.ElideRight }
                                Item { Layout.fillWidth: true; visible: scene.modelData.slugline === "" }
                            }
                            Ui.Separator { Layout.fillWidth: true }
                        }
                        GridLayout {
                            Layout.fillWidth: true
                            columns: scene.columns
                            columnSpacing: Ui.Metrics.xl
                            rowSpacing: Ui.Metrics.xl
                            Repeater {
                                model: scene.modelData.shots
                                delegate: Item {
                                    id: slot
                                    required property var modelData
                                    Layout.fillWidth: true
                                    Layout.preferredWidth: 1
                                    Layout.alignment: Qt.AlignTop
                                    implicitHeight: shotCard.implicitHeight
                                    HoverHandler { id: slotHover }
                                    ShotCard {
                                        id: shotCard
                                        width: parent.width
                                        shot: slot.modelData
                                        boardDocument: board.document
                                        caption: board.captions[slot.modelData.id] || ""
                                        mediaBrowser: board.mediaBrowser
                                        timeline: board.controller.timeline
                                        selected: board.selectedShotId === slot.modelData.id
                                        stillsOnly: board.stillsOnly
                                        readOnly: board.readOnly
                                        draggable: !board.readOnly && !board.searching
                                        dropTarget: board.dropTargetId === slot.modelData.id
                                        ratio: board.ratio
                                        Component.onCompleted: board.cardItems[slot.modelData.id] = shotCard
                                        Component.onDestruction: if (board.cardItems[slot.modelData.id] === shotCard) delete board.cardItems[slot.modelData.id]
                                        onSelectRequested: { board.select(slot.modelData.id); grid.forceActiveFocus() }
                                        onEditRequested: board.editShotRequested(slot.modelData.id)
                                        onRenderRequested: kind => board.openRender(kind, [slot.modelData.id])
                                        onDuplicateRequested: board.duplicate(slot.modelData.id)
                                        onNudgeRequested: direction => board.nudge(slot.modelData.id, direction)
                                        onDeleteRequested: board.confirmDelete(slot.modelData.id)
                                        onFullscreenRequested: (kind, take) => viewer.openTake(kind, take)
                                        onDragStarted: board.dragShotId = slot.modelData.id
                                        onDragMoved: point => board.dragTo(point)
                                        onDragEnded: board.dropDragged()
                                    }
                                    // The + between cards inserts a shot after this one.
                                    Ui.ToolbarIconButton {
                                        objectName: "shotInsert_" + slot.modelData.id
                                        // Centred on the gap between this card and the next.
                                        anchors.horizontalCenter: parent.right
                                        anchors.horizontalCenterOffset: Ui.Metrics.md
                                        anchors.verticalCenter: parent.verticalCenter
                                        z: Ui.Metrics.layerOverlay
                                        visible: !board.readOnly && !board.searching
                                        opacity: slotHover.hovered || activeFocus ? 1 : 0
                                        iconName: "add"
                                        text: "Insert a shot after " + (board.captions[slot.modelData.id] || "")
                                        onClicked: board.addShot(slot.modelData.id)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // The selected shot's inspector, under the grid.
            Rectangle {
                objectName: "shotInspector"
                Layout.fillWidth: true
                visible: !!board.activeShot
                implicitHeight: inspector.implicitHeight + 2 * Ui.Metrics.md
                radius: Ui.Metrics.radiusCard
                color: Ui.Theme.surfacePanel
                border.width: Ui.Metrics.border
                border.color: Ui.Theme.borderSubtle
                Flow {
                    id: inspector
                    x: Ui.Metrics.xl
                    y: Ui.Metrics.md
                    width: parent.width - 2 * Ui.Metrics.xl
                    spacing: Ui.Metrics.lg
                    readonly property var shot: board.activeShot || ({})
                    readonly property string scriptId: (board.document.screenplay || {}).script_id || ""
                    Ui.Text {
                        height: Ui.Metrics.standard
                        verticalAlignment: Text.AlignVCenter
                        text: "Shot " + ((inspector.shot.index || 0) + 1) + " selected"
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                    }
                    Ui.Text {
                        width: Math.min(inspector.width, Math.max(Ui.Metrics.xl * 15, implicitWidth))
                        height: Math.max(Ui.Metrics.standard, implicitHeight)
                        verticalAlignment: Text.AlignVCenter
                        wrapMode: Text.Wrap
                        text: (inspector.shot.action || "").trim() || "No action described"
                        role: Ui.Typography.SansLabel
                    }
                    Ui.Text { height: Ui.Metrics.standard; verticalAlignment: Text.AlignVCenter; text: "Appears in"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                    Ui.EditorButton {
                        visible: inspector.scriptId !== "" && (inspector.shot.script_line_ids || []).length > 0
                        density: Ui.EditorButton.Compact
                        text: "Script"
                        description: "Open the script these shot lines come from"
                        onClicked: board.scriptRequested(inspector.scriptId)
                    }
                    Ui.Text {
                        visible: !(inspector.scriptId !== "" && (inspector.shot.script_line_ids || []).length > 0)
                        height: Ui.Metrics.standard
                        verticalAlignment: Text.AlignVCenter
                        text: "Nothing yet"
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Disabled
                    }
                    Ui.EditorButton {
                        objectName: "shotInspectorEdit"
                        visible: !board.readOnly
                        variant: Ui.EditorButton.Primary
                        text: "Edit"
                        description: "Open this shot's fields, takes, and script lines"
                        onClicked: board.editShotRequested(inspector.shot.id)
                    }
                    Ui.EditorButton {
                        visible: !board.readOnly
                        variant: Ui.EditorButton.Flat
                        text: "Regenerate"
                        description: "Render a new still and choose its model"
                        loading: Draft.isGenerating(inspector.shot)
                        enabled: !Draft.isGenerating(inspector.shot)
                        onClicked: board.openRender("image", [inspector.shot.id])
                    }
                    Ui.EditorButton {
                        objectName: "shotInspectorDelete"
                        visible: !board.readOnly
                        variant: Ui.EditorButton.Flat
                        text: "Delete"
                        description: "Delete this shot"
                        enabled: !Draft.isGenerating(inspector.shot)
                        onClicked: board.confirmDelete(inspector.shot.id)
                    }
                    Ui.ToolbarIconButton { iconName: "close"; text: "Clear shot selection"; onClicked: board.selectedShotId = "" }
                }
            }
        }
    }
}

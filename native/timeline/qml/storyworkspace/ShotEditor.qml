import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "shotDraft.js" as Draft

// The shot editor the storyboard opens over itself. A port of web ShotEditPanel.
// The form is a draft: nothing typed here reaches the board until Save writes the changed fields
// in one edit. "Regenerate still" saves, then renders from what was saved. Choosing a take,
// removing one, and changing the cast are completed acts and save at once, as on the board.
Ui.Surface {
    id: editor
    objectName: "shotEditor"
    variant: Ui.Surface.Canvas
    required property var workspace
    required property var controller
    property var mediaBrowser: null
    // A ShotWorkflow: renders, take choice, and the prompt preview.
    required property var renders
    property string shotId: ""
    property bool readOnly: false
    signal closeRequested()
    signal shotChangeRequested(string shotId)
    signal scriptRequested(string scriptId, string lineId)

    readonly property var board: workspace.resource || ({})
    readonly property var document: board.document || ({})
    readonly property var shots: document.shots || []
    readonly property var shot: shots.find(row => row.id === shotId) || null
    readonly property var ordered: Draft.sceneOrder(shots).reduce((list, group) => list.concat(group.shots), [])
    readonly property int position: ordered.findIndex(row => row.id === shotId)
    readonly property var numbering: Draft.displayNumber(shotId, shots)
    readonly property string scriptId: (document.screenplay || {}).script_id || ""
    readonly property bool linksLines: scriptId !== "" && !!shot && (shot.script_line_ids || []).length > 0
    readonly property bool generating: !!shot && (Draft.isGenerating(shot) || editor.renders.busy)
    readonly property bool stacked: width < Ui.Metrics.xl * 56

    property var draft: null
    property var original: null
    property string draftedFor: ""
    readonly property bool dirty: !!draft && !!original && Draft.isDirty(draft, original)
    readonly property bool durationInvalid: !!draft && Draft.isDurationInvalid(draft.durationSeconds)
    readonly property var previewShot: shot && draft ? Draft.savedShot(shot, Draft.patchFromChanged(draft, original, shot)) : shot
    readonly property bool clipNeedsStill: !!previewShot && (previewShot.render_mode || "keyframe") === "keyframe" && !shot.keyframe
    // A close or a step to another shot that waits for the discard question. Null while none waits.
    property var pending: null
    property var saveConflicts: []
    // The render that a save conflict interrupted. It starts when the conflict is answered.
    property string conflictedRender: ""
    // A render that waits for the save to finish before it reads the saved board.
    property var queuedRender: null

    onShotChanged: {
        if (!shot || draftedFor === shot.id) return
        draftedFor = shot.id
        draft = Draft.fromShot(shot)
        original = draft
    }
    function setDraft(key, value) { draft = Draft.withField(draft, key, value) }

    // Write the changed fields in one edit. Returns false when a conflict question is now open.
    function commit(resolution) {
        if (!shot || !draft || !original || readOnly) return true
        const current = Draft.fromShot(shot)
        const conflicts = Draft.conflictingKeys(draft, original, current)
        if (conflicts.length > 0 && resolution === undefined) { saveConflicts = conflicts; return false }
        const resolved = resolution === "current" ? Draft.withCurrentFields(draft, current, conflicts) : draft
        const changed = Draft.changedKeys(resolved, original)
        if (changed.length > 0) {
            if (!workspace.applyShotDraft(shot.id, Draft.patchFromChanged(resolved, original, shot))) return false
            workspace.save()
        }
        const merged = Draft.withCurrentFields(current, resolved, changed)
        draft = merged
        original = merged
        saveConflicts = []
        return true
    }
    function save() {
        if (durationInvalid) return
        conflictedRender = ""
        commit()
    }
    function regenerate() {
        const saved = commit()
        conflictedRender = saved ? "" : "image"
        if (saved) openRender("image")
    }
    function renderClip() {
        const saved = commit()
        conflictedRender = saved ? "" : "video"
        if (saved) openRender("video")
    }
    // Every render asks for its model first, opened on the model the shot used last.
    function openRender(kind) {
        renderDialog.active = true
        const mode = previewShot && (previewShot.render_mode || "keyframe") === "keyframe" ? "image_to_video" : "video"
        renderDialog.item.openFor(kind, kind === "image" ? "image" : mode, kind === "image" ? shot.still_model : shot.clip_model)
    }
    function startRender(kind, model) {
        if (workspace.dirty || controller.busy) { queuedRender = {kind, model}; return }
        queuedRender = null
        editor.renders.render(controller.result, shotId, kind, model)
    }
    function nudge(direction) {
        if (shot && workspace.nudgeShot(shot.id, direction)) workspace.save()
    }
    function accept(kind, index) {
        if (workspace.dirty || controller.busy) return
        editor.renders.accept(controller.result, shotId, kind, index)
    }
    function removeTake(kind, index) {
        if (shot && workspace.removeShotVersion(shot.id, kind, index)) workspace.save()
    }
    // The shot's cast changes at once. An entity the shot only inferred joins the explicit list.
    function toggleEntity(id) {
        if (!shot) return
        const base = shot.entity_ids || appliedEntities.map(entity => entity.id)
        const ids = base.includes(id) ? base.filter(other => other !== id) : base.concat([id])
        if (workspace.patchShot(shot.id, "entity_ids", ids)) workspace.save()
    }

    function completeLeave(target) {
        if (target.shotId) { draftedFor = ""; shotChangeRequested(target.shotId) }
        else if (target.scriptLine !== undefined) { scriptRequested(scriptId, target.scriptLine); closeRequested() }
        else closeRequested()
    }
    function leave(target) {
        if (dirty) { pending = target; discardDialog.open(); return }
        completeLeave(target)
    }
    function runPending(saveFirst) {
        const target = pending
        if (saveFirst && !commit()) return
        pending = null
        discardDialog.close()
        if (target) completeLeave(target)
    }
    function keepEditing() { pending = null; discardDialog.close() }
    function resolveConflicts(resolution) {
        if (!commit(resolution)) return
        const render = conflictedRender
        conflictedRender = ""
        if (render !== "") openRender(render)
        if (pending) { const target = pending; pending = null; discardDialog.close(); completeLeave(target) }
    }
    function step(delta) {
        const next = ordered[position + delta]
        if (next) leave({shotId: next.id})
    }
    function editInScript() {
        const ids = shot.script_line_ids || []
        leave({scriptLine: ids.length > 0 ? ids[0] : ""})
    }

    // The board's entities with this shot's applied set: explicit ids, else the names the text uses.
    readonly property var boardEntities: (document.entityIds || []).map(id => {
        if (mediaBrowser) mediaBrowser.requestThumbnail(id)
        const detail = mediaBrowser ? mediaBrowser.details[id] || {} : {}
        return {id: id, name: detail.name || "", kind: detail.kind || ""}
    })
    readonly property var appliedEntities: {
        if (!shot) return []
        if (shot.entity_ids) return boardEntities.filter(entity => shot.entity_ids.includes(entity.id))
        const text = [shot.action, shot.motion, shot.dialogue, shot.narration, shot.slug].filter(part => !!part).join("\n").toLowerCase()
        return boardEntities.filter(entity => entity.kind === "style" || entity.kind === "location"
            || (entity.name.trim() !== "" && text.includes(entity.name.trim().toLowerCase())))
    }
    readonly property var promptDocument: {
        if (!previewShot) return document
        const next = Object.assign({}, document)
        next.shots = shots.map(row => row.id === previewShot.id ? previewShot : row)
        return next
    }

    focus: true
    Keys.onPressed: event => {
        if ((event.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) && event.key === Qt.Key_S) { save(); event.accepted = true }
        else if (event.key === Qt.Key_Escape && pending === null) { leave({}); event.accepted = true }
    }
    Shortcut { sequences: [StandardKey.Save]; enabled: editor.visible; onActivated: editor.save() }

    Connections {
        target: editor.controller
        function onChanged() {
            if (editor.queuedRender && !editor.controller.busy && !editor.workspace.dirty) {
                const queued = editor.queuedRender
                Qt.callLater(() => editor.startRender(queued.kind, queued.model))
            }
        }
    }
    // A panel that is still loading its shot shows nothing, as the web panel returns null.
    ColumnLayout {
        anchors.fill: parent
        visible: !!editor.shot && !!editor.draft
        spacing: Ui.Metrics.none

        GridLayout {
            objectName: "shotEditorHeader"
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.xl
            Layout.rightMargin: Ui.Metrics.xl
            Layout.topMargin: Ui.Metrics.md
            Layout.bottomMargin: Ui.Metrics.md
            columns: editor.stacked ? 1 : 3
            columnSpacing: Ui.Metrics.md
            rowSpacing: Ui.Metrics.sm
            // Back on the left, the shot and its steppers centred, actions right: the side columns share the width.
            Item {
                Layout.fillWidth: true
                Layout.preferredWidth: 1
                implicitHeight: back.implicitHeight
                Ui.EditorButton {
                    id: back
                    objectName: "shotEditorBack"
                    anchors.verticalCenter: parent.verticalCenter
                    iconName: "navigateBefore"
                    text: "Back to storyboard"
                    onClicked: editor.leave({})
                }
            }
            RowLayout {
                Layout.alignment: editor.stacked ? Qt.AlignLeft : Qt.AlignHCenter
                spacing: Ui.Metrics.md
                Ui.ToolbarIconButton {
                    objectName: "shotEditorPrevious"
                    iconName: "navigateBefore"
                    text: "Previous shot"
                    enabled: editor.position > 0
                    onClicked: editor.step(-1)
                }
                Ui.Text {
                    objectName: "shotEditTitle"
                    role: Ui.Typography.SansTitle
                    text: "Scene " + (editor.numbering.scene || "—") + ", Shot " + (editor.numbering.shot || "—")
                }
                Ui.ToolbarIconButton {
                    objectName: "shotEditorNext"
                    iconName: "navigateNext"
                    text: "Next shot"
                    enabled: editor.position >= 0 && editor.position < editor.ordered.length - 1
                    onClicked: editor.step(1)
                }
            }
            RowLayout {
                Layout.alignment: editor.stacked ? Qt.AlignLeft : Qt.AlignRight | Qt.AlignVCenter
                Layout.fillWidth: !editor.stacked
                Layout.preferredWidth: 1
                opacity: editor.readOnly ? 0 : 1
                enabled: !editor.readOnly
                spacing: Ui.Metrics.sm
                Item { Layout.fillWidth: true; visible: !editor.stacked }
                Ui.ToolbarIconButton {
                    id: moreButton
                    objectName: "shotEditorMore"
                    iconName: "moreVert"
                    text: "More actions"
                    accessibleName: "More shot actions"
                    onClicked: moreMenu.openAt(moreButton)
                }
                Ui.EditorButton {
                    objectName: "shotEditorRegenerate"
                    text: "Regenerate still"
                    enabled: !editor.durationInvalid && !editor.generating
                    loading: editor.generating
                    description: editor.generating ? "A render is already in progress." : ""
                    onClicked: editor.regenerate()
                }
                Ui.EditorButton {
                    objectName: "shotEditorSave"
                    variant: Ui.EditorButton.Primary
                    text: "Save"
                    shortcutText: "Ctrl+S"
                    enabled: editor.dirty && !editor.durationInvalid
                    onClicked: editor.save()
                }
            }
        }
        Ui.Separator { Layout.fillWidth: true }
        Ui.Text {
            objectName: "shotEditorError"
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.md
            visible: text !== ""
            text: editor.workspace.error || editor.renders.error || editor.controller.error || ""
            tone: Ui.Text.Error
            role: Ui.Typography.SansLabel
            wrapMode: Text.Wrap
        }

        // Below 56rem the two columns stack and the body scrolls as one.
        Flickable {
            id: body
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            interactive: editor.stacked
            contentWidth: width
            contentHeight: editor.stacked ? columns.implicitHeight : height
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: Ui.ScrollBar { visible: editor.stacked }
            GridLayout {
                id: columns
                width: body.width
                height: editor.stacked ? implicitHeight : body.height
                columns: editor.stacked ? 1 : 2
                columnSpacing: Ui.Metrics.none
                rowSpacing: Ui.Metrics.none

                Flickable {
                    id: formScroll
                    objectName: "shotEditorForm"
                    Layout.fillHeight: !editor.stacked
                    Layout.preferredWidth: editor.stacked ? body.width : Math.max(Ui.Metrics.xl * 20, Math.min(Ui.Metrics.xl * 28, body.width * 0.4))
                    Layout.preferredHeight: editor.stacked ? form.implicitHeight + 2 * Ui.Metrics.xl : -1
                    clip: true
                    interactive: !editor.stacked
                    contentHeight: form.implicitHeight + 2 * Ui.Metrics.xl
                    boundsBehavior: Flickable.StopAtBounds
                    ScrollBar.vertical: Ui.ScrollBar { visible: !editor.stacked }
                    ShotEditForm {
                        id: form
                        x: Ui.Metrics.xl
                        y: Ui.Metrics.xl
                        width: formScroll.width - 2 * Ui.Metrics.xl
                        editor: editor
                    }
                    Rectangle {
                        // Parented to the column, so the divider stays put while the form scrolls.
                        parent: formScroll
                        anchors.right: parent.right
                        width: Ui.Metrics.border
                        height: formScroll.height
                        visible: !editor.stacked
                        color: Ui.Theme.borderSubtle
                    }
                }

                ColumnLayout {
                    objectName: "shotEditorViewerColumn"
                    Layout.fillWidth: true
                    Layout.fillHeight: !editor.stacked
                    Layout.margins: Ui.Metrics.xl
                    spacing: Ui.Metrics.lg
                    ShotEditViewer {
                        Layout.fillWidth: true
                        Layout.fillHeight: !editor.stacked
                        Layout.minimumHeight: Ui.Metrics.xl * 14
                        Layout.preferredHeight: editor.stacked ? Ui.Metrics.xl * 24 : -1
                        shot: editor.previewShot || ({})
                        visible: !!editor.previewShot
                        mediaBrowser: editor.mediaBrowser
                        timeline: editor.controller.timeline
                        readOnly: editor.readOnly
                        generating: editor.generating
                        onAcceptRequested: (kind, index) => editor.accept(kind, index)
                    }
                    Flickable {
                        Layout.fillWidth: true
                        Layout.preferredHeight: Math.min(takes.implicitHeight, editor.stacked ? takes.implicitHeight : editor.height / 3)
                        clip: true
                        contentHeight: takes.implicitHeight
                        boundsBehavior: Flickable.StopAtBounds
                        ScrollBar.vertical: Ui.ScrollBar {}
                        ShotTakesGallery {
                            id: takes
                            width: parent.width
                            shot: editor.shot || ({})
                            shots: editor.shots
                            mediaBrowser: editor.mediaBrowser
                            timeline: editor.controller.timeline
                            readOnly: editor.readOnly
                            onAcceptRequested: (kind, index) => editor.accept(kind, index)
                            onRemoveRequested: (kind, index) => editor.removeTake(kind, index)
                        }
                    }
                }
            }
        }
    }

    Ui.ContextMenu {
        id: moreMenu
        objectName: "shotEditorMoreMenu"
        Ui.MenuItem {
            objectName: "shotEditorRenderClip"
            text: editor.shot && editor.shot.clip ? "Render clip again" : "Render clip"
            shortcutText: editor.generating ? "A render is already in progress." : editor.clipNeedsStill ? "Render a still before rendering a clip." : ""
            enabled: !editor.generating && !editor.clipNeedsStill
            onTriggered: editor.renderClip()
        }
        Ui.MenuItem {
            objectName: "shotEditorMoveEarlier"
            text: "Move shot earlier"
            enabled: editor.numbering.shot > 1
            onTriggered: editor.nudge(-1)
        }
        Ui.MenuItem {
            objectName: "shotEditorMoveLater"
            text: "Move shot later"
            enabled: editor.numbering.shot < editor.numbering.inScene
            onTriggered: editor.nudge(1)
        }
    }

    // The model picker loads when a render asks for a model.
    Loader {
        id: renderDialog
        objectName: "shotRenderDialogLoader"
        active: false
        source: "ShotRenderDialog.qml"
        onLoaded: item.renderRequested.connect((kind, model) => editor.startRender(kind, model))
    }

    Ui.Dialog {
        id: discardDialog
        objectName: "shotDiscardDialog"
        title: "Discard your changes?"
        width: Math.min(Ui.Metrics.dialogWidth, editor.width)
        onRejected: editor.keepEditing()
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.sm
            Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; text: "Your unsaved edits will be lost." }
            Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; text: "Actions already completed, such as renders, cannot be undone." }
        }
        footer: RowLayout {
            spacing: Ui.Metrics.sm
            Item { Layout.fillWidth: true }
            Ui.EditorButton { Layout.bottomMargin: Ui.Metrics.xl; variant: Ui.EditorButton.Flat; text: "Keep editing"; onClicked: editor.keepEditing() }
            Ui.EditorButton { objectName: "shotDiscard"; Layout.bottomMargin: Ui.Metrics.xl; variant: Ui.EditorButton.Flat; textTone: Ui.Text.Error; text: "Discard changes"; onClicked: editor.runPending(false) }
            Ui.EditorButton { Layout.bottomMargin: Ui.Metrics.xl; Layout.rightMargin: Ui.Metrics.xl; variant: Ui.EditorButton.Primary; text: "Save"; onClicked: editor.runPending(true) }
        }
    }

    Ui.Dialog {
        id: conflictDialog
        objectName: "shotConflictDialog"
        title: "This shot has changed"
        visible: editor.saveConflicts.length > 0
        width: Math.min(Ui.Metrics.dialogWidth, editor.width)
        onRejected: editor.saveConflicts = []
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.md
            Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; text: "This shot changed elsewhere while you were editing. Choose which values to keep." }
            Repeater {
                model: editor.saveConflicts
                delegate: ColumnLayout {
                    required property string modelData
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: Draft.LABELS[modelData]; role: Ui.Typography.SansLabel }
                    Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; text: "Your edit: " + Draft.formatValue(modelData, editor.draft ? editor.draft[modelData] : undefined) }
                    Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; text: "Current value: " + Draft.formatValue(modelData, editor.shot ? Draft.fromShot(editor.shot)[modelData] : undefined) }
                }
            }
        }
        footer: RowLayout {
            spacing: Ui.Metrics.sm
            Item { Layout.fillWidth: true }
            Ui.EditorButton { Layout.bottomMargin: Ui.Metrics.xl; variant: Ui.EditorButton.Flat; text: "Keep editing"; onClicked: editor.saveConflicts = [] }
            Ui.EditorButton { Layout.bottomMargin: Ui.Metrics.xl; variant: Ui.EditorButton.Flat; text: "Use current value"; onClicked: editor.resolveConflicts("current") }
            Ui.EditorButton { Layout.bottomMargin: Ui.Metrics.xl; Layout.rightMargin: Ui.Metrics.xl; variant: Ui.EditorButton.Primary; text: "Keep my edit"; onClicked: editor.resolveConflicts("mine") }
        }
    }
}

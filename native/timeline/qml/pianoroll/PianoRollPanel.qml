// nt-panel: slot=bottom id=pianoRoll order=105 title="Piano Roll"
// The piano roll (web PianoRollPanel.tsx and PianoRoll.tsx): the note editor
// for one midi clip. It follows the selection: select one midi clip and the
// panel edits it. It keeps that clip when the selection moves to something
// that is not a midi clip. The layout is Logic's: a toolbar, a local inspector,
// the ruler with a region strip, the keyboard and grid, and the MIDI Draw lanes.
// PanelSlot supplies no properties. Follow the visual parent chain to the
// TimelineEditor (timeline + clock), then its TracksRegion (gestures, viewState).
// UI thread only. Every edit is one write through the controller, so one undo entry.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "PianoRollNotes.js" as Notes
import "PianoRollLanes.js" as Lanes
import "PianoRollTools.js" as Tools

Rectangle {
    id: root
    objectName: "pianoRollPanel"
    color: Ui.Theme.surfaceCanvas
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: parent && parent.parent ? parent.parent.height : Ui.Metrics.dialogWidth

    readonly property real baseRowHeight: Ui.Metrics.lg
    property real rowZoom: 1
    readonly property real rowHeight: baseRowHeight * rowZoom
    readonly property real keyboardWidth: Ui.Metrics.xxxl * 2
    readonly property real rulerHeight: Ui.Metrics.small
    readonly property real stripHeight: Ui.Metrics.iconXs
    readonly property real gridTop: rulerHeight + stripHeight
    readonly property real velocityHeight: Ui.Metrics.xxxl * 3
    readonly property real laneBarHeight: Ui.Metrics.standard
    readonly property real laneMargin: Ui.Metrics.sm
    readonly property real pointSize: Ui.Metrics.sm
    readonly property real minPxPerTick: 0.002
    readonly property real maxPxPerTick: 1
    readonly property real zoomStep: 1.15
    readonly property real dragThreshold: Ui.Metrics.xs
    readonly property bool mac: Qt.platform.os === "osx"

    property var editor: null
    property var region: null
    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined) return item
            item = item.parent
        }
        return null
    }
    function findRegion(item) {
        if (!item) return null
        if (item.gestures !== undefined && item.viewState !== undefined) return item
        const children = item.children || []
        for (let i = 0; i < children.length; ++i) {
            const found = findRegion(children[i])
            if (found) return found
        }
        return null
    }
    function attach() {
        editor = editorAbove()
        region = findRegion(editor)
        if (!inspectorSized && width > 0) {
            inspectorSized = true
            // A phone-width panel starts with the inspector hidden.
            inspectorVisible = width >= Ui.Metrics.dialogCompactWidth
        }
        followSelection()
    }
    property bool inspectorSized: false
    onWidthChanged: if (!inspectorSized && width > 0) Qt.callLater(attach)
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)

    // The clip the panel edits. The selection sets it; a test or caller can too.
    property alias clipId: controller.clipId
    readonly property var gestures: region ? region.gestures : null
    readonly property var clock: editor ? editor.clock : null
    readonly property var undoStack: controller.timeline ? controller.timeline.undoStack : null
    readonly property bool canUndo: !!undoStack && undoStack.canUndo
    readonly property bool canRedo: !!undoStack && undoStack.canRedo
    readonly property bool controllerEditable: controller.editable
    readonly property string clipName: controller.valid ? controller.clipName : ""
    readonly property string trackName: controller.valid ? controller.trackName : ""
    readonly property color clipAccent: {
        for (const text of [controller.clipColor, controller.trackColor]) {
            if (/^#[0-9a-fA-F]{6}$/.test(text)) return text
            if (/^#[0-9a-fA-F]{8}$/.test(text)) return "#" + text.slice(7, 9) + text.slice(1, 7)
        }
        return Ui.Theme.accentPrimary
    }
    readonly property color stripInk: {
        const background = Ui.Theme.surfaceCanvas
        const rgb = [clipAccent.r, clipAccent.g, clipAccent.b].map((c, i) => {
            const bg = [background.r, background.g, background.b][i]
            const blended = c * clipAccent.a + bg * (1 - clipAccent.a)
            return blended <= 0.04045 ? blended / 12.92 : Math.pow((blended + 0.055) / 1.055, 2.4)
        })
        const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
        return luminance > 0.179 ? Qt.rgba(Ui.Theme.scrimModal.r, Ui.Theme.scrimModal.g, Ui.Theme.scrimModal.b, 1) : Ui.Theme.textOnAccent
    }
    readonly property var clipRgb: [Math.round(clipAccent.r * 255), Math.round(clipAccent.g * 255), Math.round(clipAccent.b * 255)]

    // ── Settings. In-memory UI state, like the grid division was. ─────────
    property string tool: "pointer"
    property string altTool: "pencil"
    property bool snapOn: true
    property string snapValue: "smart"
    property string dragMode: "overlap"
    property bool collapseMode: false
    property bool drawVisible: true
    // Pitch names inside notes. Off by default, as in Logic (MUSIC_EDITOR_UI.md 4.1).
    property bool noteLabels: false
    onNoteLabelsChanged: grid.requestPaint()
    property bool catchOn: true
    property bool linkOn: true
    property bool inspectorVisible: true
    property string noteColorMode: "velocity"
    property string quantizeValue: "1/16"
    property real quantizeStrength: 100
    property real quantizeSwing: 0
    property int scaleRoot: 0
    property string scaleId: "chromatic"
    property bool snapToScale: false
    readonly property var scaleIv: Tools.scaleIntervals(scaleId)
    readonly property bool scaleActive: scaleIv !== null
    property string scaleRootClip: ""

    function followSelection() {
        if (!gestures || !linkOn) return
        const selection = gestures.selection || []
        if (selection.length !== 1) return
        const clip = gestures.clipData(selection[0])
        if (clip && clip.mediaType === "midi" && controller.clipId !== selection[0]) controller.clipId = selection[0]
    }
    onLinkOnChanged: followSelection()
    Connections {
        target: root.gestures
        ignoreUnknownSignals: true
        function onSelectionChanged() { root.followSelection() }
    }
    // Catch: while the transport plays, keep the playhead in view.
    Connections {
        target: root.clock
        ignoreUnknownSignals: true
        function onTimeChanged() { root.catchPlayhead() }
    }
    function catchPlayhead() {
        if (!catchOn || !clock || !clock.playing || !controller.valid || gridArea.width <= 0) return
        const next = Tools.catchScroll(playheadTick(), scrollTick, gridArea.width / pxPerTick)
        if (next !== scrollTick) scrollTick = next
    }

    PianoRollController {
        id: controller
        timeline: root.editor ? root.editor.timeline : null
        onClipIdChanged: root.framed = false
        onClipChanged: {
            root.velocityCancel()
            if (!valid) return
            if (root.scaleRootClip !== clipId) {
                root.scaleRootClip = clipId
                root.scaleRoot = Tools.defaultScaleRoot(keyTonic)
            }
            const ids = {}
            for (let i = 0; i < notes.length; ++i) ids[notes[i].id] = true
            root.selectedIds = root.selectedIds.filter(id => ids[id])
            if (root.laneInfo.type === "controller") {
                const pointIds = {}
                for (const lane of controllers) for (const point of lane.points) pointIds[point.id] = true
                root.selectedPointIds = root.selectedPointIds.filter(id => pointIds[id])
            } else if (root.laneInfo.type === "expression") {
                // Expression points carry index ids. Keep the ones the edited note still has.
                const target = root.selectedIds.length === 1 ? notes.find(note => note.id === root.selectedIds[0]) : null
                const curve = target && target.expression ? target.expression[root.laneInfo.key] : null
                const count = curve ? curve.length : 0
                root.selectedPointIds = root.selectedPointIds.filter(id => parseInt(String(id).substring(1), 10) < count)
            } else {
                root.selectedPointIds = []
            }
            root.frameIfNeeded()
        }
    }

    // ── View state ───────────────────────────────────────────────────────
    property real pxPerTick: 0.05
    property real scrollTick: 0
    property int topPitch: 72
    property int collapseTopRow: 0
    property bool framed: false
    property var selectedIds: []
    // A gesture draws from these notes and writes them once, on release.
    property var liveNotes: null
    readonly property var notes: liveNotes !== null ? liveNotes : controller.notes
    readonly property var selectedSet: Notes.idSet(selectedIds)
    // Collapse Mode rows come from the committed notes, never from a drag preview.
    readonly property var rowSet: collapseMode ? Tools.rowSet(controller.notes) : null
    readonly property var geometry: ({pxPerTick: pxPerTick, scrollTick: scrollTick, rowHeight: rowHeight, topPitch: topPitch,
                                      rows: rowSet, topRow: rowSet ? Math.max(0, Math.min(collapseTopRow, rowSet.pitches.length - Math.floor(gridArea.height / rowHeight))) : 0})
    readonly property real beatTicks: controller.valid ? controller.gridStepTicks("beat") : 960
    readonly property real smartTicks: Notes.smartSnapTicks(pxPerTick, beatTicks, controller.beatsPerBar)
    readonly property real gridStepTicks: !controller.valid ? 960 : snapValue === "smart" ? smartTicks : controller.gridStepTicks(snapValue)
    readonly property real gridPhaseTick: controller.valid ? controller.timelineMsToTick(controller.offsetMs) : 0
    property var clipboard: []
    // The pointer over the grid, and the notes a drag is moving. Both feed the position display.
    property var hoverPos: null
    property var dragIds: []

    // ── Lane state ───────────────────────────────────────────────────────
    // The lane under the grid: the velocity bars, a controller lane or one note's expression curve.
    property string laneChoice: "velocity"
    property int otherCc: 74
    property bool newLaneStep: false
    property bool laneFocused: false
    property var selectedPointIds: []
    property string expressionNoteId: ""
    // A lane gesture draws from these lanes and writes them once, on release.
    property var liveControllers: null
    readonly property var controllers: liveControllers !== null ? liveControllers : controller.controllers
    readonly property bool singleNoteSelected: selectedIds.length === 1 && selectedNotes().length === 1
    readonly property string effectiveLane: laneChoice.indexOf("note:") === 0 && !singleNoteSelected ? "velocity" : laneChoice
    readonly property var laneInfo: Lanes.describeLane(effectiveLane, otherCc)
    readonly property var editingNote: laneInfo.type === "expression" && singleNoteSelected ? selectedNotes()[0] : null
    readonly property var laneLane: {
        if (laneInfo.type !== "controller") return null
        const index = Lanes.findLane(controllers, laneInfo.spec)
        return index < 0 ? null : controllers[index]
    }
    readonly property bool laneStep: laneLane ? laneLane.interpolation === "step" : newLaneStep
    readonly property var lanePoints: {
        if (laneInfo.type === "controller") return laneLane ? laneLane.points : []
        if (laneInfo.type === "expression" && editingNote) return Lanes.editableExpression(editingNote.expression ? editingNote.expression[laneInfo.key] : null)
        return []
    }
    // Ticks of the lane's points are measured from this tick.
    readonly property real laneBaseTick: laneInfo.type === "expression" && editingNote ? editingNote.startTick : 0
    readonly property var channelState: Notes.commonValue(notes, selectedIds, "channel", 0)
    readonly property var releaseState: Notes.commonValue(notes, selectedIds, "releaseVelocity", 0)
    // The velocity slider follows the earliest selected note, including its preview.
    readonly property int shownVelocity: {
        const v = Tools.earliestVelocity(notes, selectedIds)
        return v === null ? 100 : v
    }

    readonly property string positionText: {
        if (!controller.valid) return ""
        let pitch = null, tick = null
        if (dragIds.length > 0) {
            const note = notes.find(n => n.id === dragIds[0])
            if (note) { pitch = note.pitch; tick = note.startTick }
        } else if (hoverPos !== null) {
            pitch = hoverPos.pitch
            tick = hoverPos.tick
        } else {
            let first = null
            for (const note of notes) if (selectedSet[note.id] && (first === null || note.startTick < first.startTick)) first = note
            if (first) { pitch = first.pitch; tick = first.startTick }
        }
        return Tools.positionText(pitch, tick, gridPhaseTick, beatTicks, controller.beatsPerBar)
    }

    function frameIfNeeded() {
        if (framed || !controller.valid || gridArea.width <= 0 || gridArea.height <= 0) return
        framed = true
        const span = Math.max(1, controller.windowToTick - controller.windowFromTick)
        pxPerTick = Math.min(maxPxPerTick, Math.max(minPxPerTick, gridArea.width / span))
        scrollTick = controller.windowFromTick
        topPitch = Notes.initialTopPitch(controller.notes, gridArea.height / rowHeight)
        collapseTopRow = 0
        selectedIds = []
    }
    function setZoomFromSlider(t) { pxPerTick = Tools.sliderToZoom(t, minPxPerTick, maxPxPerTick) }
    function zoomToFit() {
        if (!controller.valid || gridArea.width <= 0) return
        const list = controller.notes
        let low = Infinity, high = 0
        for (const note of list) { low = Math.min(low, note.startTick); high = Math.max(high, note.startTick + note.durationTick) }
        if (list.length === 0) { low = controller.windowFromTick; high = controller.windowToTick }
        const span = Math.max(1, high - low)
        pxPerTick = Math.min(maxPxPerTick, Math.max(minPxPerTick, gridArea.width / (span * 1.1)))
        scrollTick = Math.max(0, low - span * 0.05)
        topPitch = Notes.initialTopPitch(list, gridArea.height / rowHeight)
        collapseTopRow = 0
    }

    function write(next) {
        liveNotes = null
        if (next.length > controller.maxNotes) return false
        return controller.setNotes(next)
    }
    function writeControllers(next) {
        liveControllers = null
        return next !== null && controller.setControllers(next)
    }
    // Draws the points of the lane under the grid. Nothing is written until commitLane().
    // `chosen` names the selected points of `points`. An expression curve keeps index ids, so its
    // selection follows the points to their new indexes.
    function applyLanePoints(points, chosen) {
        if (laneInfo.type === "controller") {
            const existed = laneLane !== null
            let next = Lanes.setLanePoints(controllers, laneInfo.spec, points, newId)
            if (next === null) return
            if (!existed && newLaneStep && points.length > 0) next = Lanes.setInterpolation(next, laneInfo.spec, "step")
            liveControllers = next
        } else if (laneInfo.type === "expression" && editingNote) {
            const target = editingNote.id
            liveNotes = notes.map(note => note.id === target ? Lanes.setNoteExpression(note, laneInfo.key, points) : note)
            if (chosen) selectedPointIds = chosen.map(id => points.findIndex(point => point.id === id)).filter(i => i >= 0).map(i => "e" + i)
        }
        curveLane.requestPaint()
    }
    // Writes the lane gesture as one undo entry.
    function commitLane() {
        if (liveControllers !== null) writeControllers(liveControllers)
        else if (liveNotes !== null) write(liveNotes)
        liveControllers = null
        liveNotes = null
        curveLane.requestPaint()
    }
    function setInterpolation(next) {
        newLaneStep = next === "step"
        if (laneLane && controller.editable) writeControllers(Lanes.setInterpolation(controllers, laneInfo.spec, next))
    }
    function repaintLane() { velocityLane.requestPaint(); curveLane.requestPaint() }
    function snapOrNot(tick, bypass) {
        return bypass || !snapOn ? Math.round(tick) : Notes.snapTick(tick, gridStepTicks, gridPhaseTick, "round")
    }
    // The tick a note starts on when a pencil or brush press lands at `tick`.
    function stepStart(tick, bypass) { return Tools.stepStartTick(tick, snapOn && !bypass, gridStepTicks, gridPhaseTick) }
    // Control on macOS (Qt's meta modifier) skips the snap. No modifier does elsewhere.
    function bypassing(mouse) { return Tools.bypassesSnap((mouse.modifiers & Qt.MetaModifier) !== 0, mac) }
    // Cmd on macOS and Ctrl elsewhere are Qt's control modifier: the press uses the second tool.
    function secondHeld(mouse) { return (mouse.modifiers & Qt.ControlModifier) !== 0 }
    function scaled(pitch) { return snapToScale && scaleActive ? Notes.snapPitchToScale(pitch, scaleRoot, scaleIv) : pitch }
    function playheadTick() { return clock ? Math.round(controller.timelineMsToTick(clock.time)) : 0 }
    function selectedNotes() { return notes.filter(note => selectedSet[note.id]) }
    function newId() { return controller.newNoteId() }
    function allIds() { return controller.notes.map(note => note.id) }
    function setNoteField(field, value) {
        const patch = {}
        patch[field] = value
        write(Notes.patchNotes(notes, selectedIds, patch))
    }

    // ── Functions ────────────────────────────────────────────────────────
    function quantizeOptions(target) {
        return {step: Tools.divisionTicks(quantizeValue), phase: gridPhaseTick, strength: quantizeStrength / 100,
                swing: quantizeSwing / 100, target: target}
    }
    // Quantizes the selection, or every note when nothing is selected.
    function quantize(target, ids) {
        const chosen = ids || (selectedIds.length > 0 ? selectedIds : allIds())
        if (chosen.length === 0 || !controller.editable) return
        write(Notes.quantizeWith(controller.notes, chosen, quantizeOptions(target)))
    }
    function chooseQuantizeValue(value) {
        quantizeValue = value
        if (selectedIds.length > 0) quantize("start", selectedIds)
    }
    function scaleQuantize() {
        if (!scaleActive || !controller.editable) return
        const chosen = selectedIds.length > 0 ? selectedIds : allIds()
        if (chosen.length > 0) write(Notes.scaleQuantizeNotes(controller.notes, scaleRoot, scaleIv, chosen))
    }
    property var velocityGesture: null
    function velocityBegin() {
        velocityGesture = {baseline: controller.notes.slice(), ids: selectedIds.slice(), shown: shownVelocity}
    }
    // Every selected note shifts by one shared delta, which stops where the first note hits 1 or 127.
    function velocityPreview(value) {
        if (!velocityGesture) velocityBegin()
        liveNotes = Notes.shiftVelocity(velocityGesture.baseline, velocityGesture.ids, value - velocityGesture.shown)
    }
    function velocityCommit(value) {
        if (!velocityGesture) velocityBegin()
        const next = Notes.shiftVelocity(velocityGesture.baseline, velocityGesture.ids, value - velocityGesture.shown)
        velocityGesture = null
        liveNotes = null
        if (JSON.stringify(next) !== JSON.stringify(controller.notes)) write(next)
    }
    function velocityCancel() { velocityGesture = null; liveNotes = null }

    function runAction(id) {
        const current = controller.notes, ids = selectedIds
        if (!controller.valid) return
        switch (id) {
        case "undo": if (undoStack) undoStack.undo(); return
        case "redo": if (undoStack) undoStack.redo(); return
        case "copy": if (ids.length > 0) clipboard = selectedNotes(); return
        case "selectAll": selectedIds = allIds(); return
        case "deselectAll": selectedIds = []; return
        case "selectFollowing": selectedIds = Tools.selectFollowing(current, ids, playheadTick()); return
        case "selectSamePitch": selectedIds = Tools.selectSamePitch(current, ids); return
        case "selectMuted": selectedIds = Tools.selectMuted(current); return
        case "invertSelection": selectedIds = Tools.invertSelection(current, ids); return
        case "inspector": inspectorVisible = !inspectorVisible; return
        case "draw": drawVisible = !drawVisible; return
        case "noteLabels": noteLabels = !noteLabels; return
        case "collapse": collapseMode = !collapseMode; return
        case "catch": catchOn = !catchOn; return
        case "link": linkOn = !linkOn; return
        case "noteColorVelocity": noteColorMode = "velocity"; return
        case "noteColorClip": noteColorMode = "clip"; return
        case "zoomFit": zoomToFit(); return
        case "quantize": quantize("start"); return
        case "quantizeLength": quantize("start_and_length"); return
        case "scaleQuantize": scaleQuantize(); return
        }
        if (!controller.editable) return
        if (id === "paste") {
            if (clipboard.length === 0) return
            const copies = Notes.pasteNotes(clipboard, playheadTick(), newId)
            if (write(current.concat(copies))) selectedIds = copies.map(note => note.id)
            return
        }
        if (ids.length === 0) return
        switch (id) {
        case "cut": clipboard = selectedNotes(); write(Notes.removeNotes(current, ids)); selectedIds = []; break
        case "delete": write(Notes.removeNotes(current, ids)); selectedIds = []; break
        case "mute": write(Notes.toggleMute(current, ids)); break
        case "transposeUp": write(Notes.moveNotes(current, ids, 0, 1)); break
        case "transposeDown": write(Notes.moveNotes(current, ids, 0, -1)); break
        case "octaveUp": write(Notes.moveNotes(current, ids, 0, 12)); break
        case "octaveDown": write(Notes.moveNotes(current, ids, 0, -12)); break
        case "forceLegato": write(Notes.forceLegato(current, ids)); break
        case "removeOverlaps": write(Notes.removeOverlaps(current, ids)); break
        case "deleteDuplicates":
            write(Notes.deleteDuplicates(current, ids))
            selectedIds = selectedIds.filter(id => controller.notes.some(note => note.id === id))
            break
        }
    }

    // ── Keyboard ─────────────────────────────────────────────────────────
    focus: true
    Keys.onPressed: event => {
        const ctrl = (event.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) !== 0
        const shift = (event.modifiers & Qt.ShiftModifier) !== 0
        const alt = (event.modifiers & Qt.AltModifier) !== 0
        const ids = root.selectedIds
        const current = root.notes
        // A gesture owns the notes and lanes until its release.
        if (gridMouse.drag || laneMouse.gesture || velocityMouse.gesture || root.velocityGesture) { event.accepted = true; return }
        if (!controller.valid) return
        if (event.key === Qt.Key_Escape) {
            if (ids.length > 0) { root.selectedIds = []; event.accepted = true }
            return
        }
        if (ctrl && event.key === Qt.Key_A) { root.runAction("selectAll"); event.accepted = true; return }
        if (ctrl && event.key === Qt.Key_C && ids.length > 0) { root.runAction("copy"); event.accepted = true; return }
        if (!controller.editable) return
        if (laneFocused && laneInfo.type !== "velocity" && (event.key === Qt.Key_Delete || event.key === Qt.Key_Backspace)) {
            // A key press in a lane deletes its selected points, or nothing. It never deletes notes.
            if (selectedPointIds.length > 0) {
                applyLanePoints(Lanes.removePoints(lanePoints, selectedPointIds))
                commitLane()
                selectedPointIds = []
            }
            event.accepted = true
            return
        }
        if (ctrl && event.key === Qt.Key_V && root.clipboard.length > 0) { root.runAction("paste"); event.accepted = true; return }
        if (!ctrl && !alt && event.key === Qt.Key_Q) { root.runAction("quantize"); event.accepted = true; return }
        if (ids.length === 0) return
        if (ctrl && event.key === Qt.Key_X) {
            root.runAction("cut")
            event.accepted = true
        } else if (event.key === Qt.Key_Delete || event.key === Qt.Key_Backspace) {
            root.runAction("delete")
            event.accepted = true
        } else if (event.modifiers === Qt.NoModifier && event.key === Qt.Key_M) {
            root.runAction("mute")
            event.accepted = true
        } else if (ctrl && event.key === Qt.Key_T) {
            const split = Notes.splitNotes(current, ids, root.playheadTick(), root.newId)
            if (root.write(split.notes)) root.selectedIds = split.ids
            event.accepted = true
        } else if (ctrl && (event.key === Qt.Key_D || event.key === Qt.Key_R)) {
            const chosen = root.selectedNotes()
            let low = Infinity, high = 0
            for (const note of chosen) { low = Math.min(low, note.startTick); high = Math.max(high, note.startTick + note.durationTick) }
            const next = Notes.duplicateNotes(current, ids, high - low, root.newId)
            if (root.write(next)) root.selectedIds = next.slice(current.length).map(note => note.id)
            event.accepted = true
        } else if (event.key === Qt.Key_Left || event.key === Qt.Key_Right) {
            const increment = (alt && !ctrl) || !root.snapOn ? 1 : root.gridStepTicks
            const step = event.key === Qt.Key_Left ? -increment : increment
            root.write(shift ? Notes.resizeNotes(current, ids, step, 1) : Notes.moveNotes(current, ids, step, 0))
            event.accepted = true
        } else if (event.key === Qt.Key_Up || event.key === Qt.Key_Down) {
            const magnitude = shift ? 12 : 1
            root.write(Notes.moveNotes(current, ids, 0, event.key === Qt.Key_Up ? magnitude : -magnitude))
            event.accepted = true
        }
    }

    // ── Toolbar and inspector ────────────────────────────────────────────
    PianoRollToolbar {
        id: toolbar
        anchors { left: parent.left; right: parent.right; top: parent.top }
        visible: controller.valid
        height: Ui.Metrics.standard
        panel: root
    }

    Ui.EmptyState {
        anchors.centerIn: parent
        visible: !controller.valid
        title: qsTr("No MIDI clip")
        message: qsTr("Select a MIDI clip to edit its notes.")
    }

    PianoRollInspector {
        id: inspector
        anchors { left: parent.left; top: toolbar.bottom; bottom: parent.bottom }
        width: visible ? Ui.Metrics.xxxl * 7 : 0
        visible: controller.valid && root.inspectorVisible
        panel: root
    }

    // ── Body ─────────────────────────────────────────────────────────────
    Item {
        id: body
        visible: controller.valid
        anchors { left: inspector.right; right: parent.right; top: toolbar.bottom; bottom: parent.bottom }

        Canvas {
            id: keyboard
            objectName: "pianoRollKeyboard"
            x: 0
            y: root.gridTop
            width: root.keyboardWidth
            height: gridArea.height
            // The key under the pointer, and the key held down. Each takes the accent tint.
            property int hoverPitch: -1
            property int pressedPitch: -1
            onHoverPitchChanged: requestPaint()
            onPressedPitchChanged: requestPaint()
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                const dark = Ui.Theme.dark
                const ivory = dark ? Ui.Theme.textPrimary : Ui.Theme.surfacePanel
                const ebony = dark ? Ui.Theme.surfaceCanvas : Ui.Theme.textPrimary
                const ink = dark ? Ui.Theme.surfaceCanvas : Ui.Theme.textSecondary
                const rh = root.rowHeight
                const collapsed = root.geometry.rows
                const tint = pitch => pitch === pressedPitch ? 0.75 : pitch === hoverPitch ? 0.4 : 0
                ctx.font = Ui.Typography.canvasFont(Ui.Typography.SansCaption)
                ctx.textBaseline = "middle"
                ctx.textAlign = "right"
                if (collapsed) {
                    // Collapse Mode shows only the keys that have notes, each a full-width labeled row.
                    ctx.fillStyle = Ui.Theme.surfacePanel
                    ctx.fillRect(0, 0, width, height)
                    const rows = Math.ceil(height / rh) + 1
                    for (let row = 0; row < rows; ++row) {
                        const pitch = collapsed.pitches[row + root.geometry.topRow]
                        if (pitch === undefined) break
                        const y = row * rh, black = Notes.isBlackKey(pitch)
                        ctx.fillStyle = black ? ebony : ivory
                        ctx.fillRect(0, y, width, rh)
                        if (tint(pitch) > 0) {
                            ctx.globalAlpha = tint(pitch)
                            ctx.fillStyle = Ui.Theme.accentPrimary
                            ctx.fillRect(0, y, width, rh)
                            ctx.globalAlpha = 1
                        }
                        ctx.fillStyle = Ui.Theme.borderStrong
                        ctx.fillRect(0, y + rh - 1, width, 1)
                        ctx.fillStyle = black ? Ui.Theme.textSecondary : ink
                        ctx.fillText(Notes.pitchName(pitch), width - Ui.Metrics.xs, y + rh / 2)
                    }
                    return
                }
                // A real keyboard: seven white keys share each octave's twelve rows, so the white
                // keys are wider than a row and their seams do not follow the grid. The black keys
                // sit on top, 60% deep, each with a lit lower bevel.
                ctx.fillStyle = ivory
                ctx.fillRect(0, 0, width, height)
                const topPitch = root.topPitch
                const lowPitch = Math.max(0, topPitch - Math.ceil(height / rh) - 1)
                const octaveBottom = c => (topPitch - c + 1) * rh
                const whiteHeight = 12 * rh / 7
                for (let c = Math.floor(lowPitch / 12) * 12; c <= topPitch; c += 12) {
                    const base = octaveBottom(c)
                    for (let k = 0; k < 7; ++k) {
                        const semitone = [0, 2, 4, 5, 7, 9, 11][k]
                        const bottom = base - k * whiteHeight, top = bottom - whiteHeight
                        const amount = tint(c + semitone)
                        if (amount > 0) {
                            ctx.globalAlpha = amount
                            ctx.fillStyle = Ui.Theme.accentPrimary
                            ctx.fillRect(0, top, width, whiteHeight)
                            ctx.globalAlpha = 1
                        }
                        // The seam under each white key. The B-C seam marks the octave.
                        ctx.fillStyle = Ui.Theme.borderStrong
                        ctx.globalAlpha = k === 0 ? 0.9 : 0.55
                        ctx.fillRect(0, Math.round(bottom) - 1, width, 1)
                        ctx.globalAlpha = 1
                    }
                    if (c >= 0 && c <= 127) {
                        const y = base - whiteHeight / 2
                        ctx.fillStyle = tint(c) > 0.5 ? Ui.Theme.textOnAccent : ink
                        ctx.fillText(Notes.pitchName(c), width - Ui.Metrics.xs, y)
                    }
                }
                const blackWidth = Math.round(width * 0.6)
                for (let pitch = lowPitch; pitch <= topPitch; ++pitch) {
                    if (!Notes.isBlackKey(pitch)) continue
                    const y = (topPitch - pitch) * rh
                    // A soft shadow falls to the right of the key onto the white keys.
                    ctx.fillStyle = Ui.Theme.scrimModal
                    ctx.globalAlpha = 0.25
                    ctx.fillRect(blackWidth, y + 1, Ui.Metrics.micro, rh - 1)
                    ctx.globalAlpha = 1
                    ctx.fillStyle = ebony
                    ctx.fillRect(0, y, blackWidth, rh)
                    // A faint sheen along the key's lower half reads as depth.
                    ctx.fillStyle = dark ? Ui.Theme.borderControl : Ui.Theme.textSecondary
                    ctx.fillRect(0, y + rh / 2, blackWidth - Ui.Metrics.micro, rh / 2 - 1)
                    // The bevel: a lighter front edge at the key's tip.
                    ctx.fillStyle = Ui.Theme.borderStrong
                    ctx.globalAlpha = 0.5
                    ctx.fillRect(blackWidth - Ui.Metrics.micro, y + 1, Ui.Metrics.micro, rh - 2)
                    ctx.globalAlpha = 1
                    const amount = tint(pitch)
                    if (amount > 0) {
                        ctx.globalAlpha = amount
                        ctx.fillStyle = Ui.Theme.accentPrimary
                        ctx.fillRect(0, y, blackWidth, rh)
                        ctx.globalAlpha = 1
                    }
                }
                // The edge between the keyboard and the grid.
                ctx.fillStyle = Ui.Theme.borderStrong
                ctx.fillRect(width - 1, 0, 1, height)
            }
            MouseArea {
                id: keyboardMouse
                objectName: "pianoRollKeyboardMouse"
                anchors.fill: parent
                hoverEnabled: true
                // A black key covers only the left 60% of its row. Its right part belongs to the
                // white key beside it, as on a real keyboard.
                function pitchAt(x, y) {
                    const pitch = Notes.yToPitch(y, root.geometry)
                    if (root.geometry.rows || !Notes.isBlackKey(pitch) || x < keyboard.width * 0.6) return pitch
                    const within = (y / root.rowHeight) % 1
                    return within < 0.5 ? pitch + 1 : pitch - 1
                }
                onPositionChanged: mouse => keyboard.hoverPitch = pitchAt(mouse.x, mouse.y)
                onExited: keyboard.hoverPitch = -1
                // A click selects every note on the key. Shift adds them to the selection.
                onPressed: mouse => {
                    root.forceActiveFocus()
                    const pitch = pitchAt(mouse.x, mouse.y)
                    keyboard.pressedPitch = pitch
                    const ids = root.notes.filter(note => note.pitch === pitch).map(note => note.id)
                    root.selectedIds = mouse.modifiers & Qt.ShiftModifier
                        ? Array.from(new Set(root.selectedIds.concat(ids))) : ids
                }
                onReleased: keyboard.pressedPitch = -1
                onCanceled: keyboard.pressedPitch = -1
            }
        }

        Canvas {
            id: ruler
            objectName: "pianoRollRuler"
            x: root.keyboardWidth
            y: 0
            width: gridArea.width
            height: root.rulerHeight
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                ctx.fillStyle = Ui.Theme.surfacePanel
                ctx.fillRect(0, 0, width, height)
                if (!controller.valid) return
                const from = Notes.xToTick(0, root.geometry), to = Notes.xToTick(width, root.geometry)
                const bars = controller.gridTicks("bar", from, to)
                const barTicks = controller.gridStepTicks("bar")
                ctx.font = Ui.Typography.canvasFont(Ui.Typography.SansCaption)
                ctx.textBaseline = "middle"
                const labelEvery = Math.max(1, Math.ceil(Ui.Metrics.xxxl / Math.max(1, barTicks * root.pxPerTick)))
                for (const tick of bars) {
                    const x = Math.round(Notes.tickToX(tick, root.geometry))
                    const bar = Math.round(controller.timelineMsToTick(controller.tickToTimelineMs(tick)) - root.gridPhaseTick) / barTicks
                    const index = Math.round(bar)
                    ctx.fillStyle = Ui.Theme.borderStrong
                    ctx.fillRect(x, height / 2, 1, height / 2)
                    if (index % labelEvery === 0) {
                        ctx.fillStyle = Ui.Theme.textSecondary
                        ctx.fillText(String(index + 1), x + Ui.Metrics.xs, height / 2)
                    }
                }
                ctx.fillStyle = Ui.Theme.borderSubtle
                ctx.fillRect(0, height - 1, width, 1)
            }
            MouseArea {
                anchors.fill: parent
                onPressed: mouse => {
                    root.forceActiveFocus()
                    if (root.clock) root.clock.seek(Math.max(0, controller.tickToTimelineMs(Notes.xToTick(mouse.x, root.geometry))))
                }
                onPositionChanged: mouse => {
                    if (pressed && root.clock) root.clock.seek(Math.max(0, controller.tickToTimelineMs(Notes.xToTick(mouse.x, root.geometry))))
                }
            }
        }

        // The region strip: the clip's extent under the ruler, in the clip color. Outside the
        // clip it keeps the darker panel shade.
        Item {
            id: regionStrip
            objectName: "pianoRollRegionStrip"
            x: root.keyboardWidth
            y: root.rulerHeight
            width: gridArea.width
            height: root.stripHeight
            clip: true
            Rectangle { anchors.fill: parent; color: Ui.Theme.surfaceCanvas }
            Rectangle {
                width: Math.min(parent.width, stripFill.x)
                height: parent.height
                color: Ui.Theme.scrimModal
                opacity: 0.5
            }
            Rectangle {
                x: Math.min(parent.width, stripFill.x + stripFill.width)
                width: parent.width - x
                height: parent.height
                color: Ui.Theme.scrimModal
                opacity: 0.5
            }
            Rectangle {
                id: stripFill
                readonly property real winLeft: Notes.tickToX(controller.windowFromTick, root.geometry)
                readonly property real winRight: Notes.tickToX(controller.windowToTick, root.geometry)
                x: Math.max(0, winLeft)
                width: Math.max(0, Math.min(regionStrip.width, winRight) - x)
                height: parent.height
                color: root.clipAccent
                Ui.Text {
                    id: stripName
                    anchors { left: parent.left; leftMargin: Ui.Metrics.xs; verticalCenter: parent.verticalCenter }
                    width: Math.min(implicitWidth, Math.max(0, parent.width - 2 * Ui.Metrics.xs))
                    role: Ui.Typography.SansCaption
                    domainColor: root.stripInk
                    elide: Text.ElideRight
                    text: root.clipName
                }
                Ui.Text {
                    anchors { right: parent.right; rightMargin: Ui.Metrics.xs; verticalCenter: parent.verticalCenter }
                    visible: parent.width > 2 * (stripName.implicitWidth + Ui.Metrics.xs) + Ui.Metrics.md
                    role: Ui.Typography.SansCaption
                    domainColor: root.stripInk
                    text: root.clipName
                }
            }
        }

        Item {
            id: gridArea
            objectName: "pianoRollGrid"
            x: root.keyboardWidth
            y: root.gridTop
            width: Math.max(0, body.width - root.keyboardWidth)
            height: Math.max(0, body.height - root.gridTop - (root.drawVisible ? root.laneBarHeight + root.velocityHeight : 0))
            clip: true
            onWidthChanged: root.frameIfNeeded()
            onHeightChanged: root.frameIfNeeded()

            Canvas {
                id: grid
                anchors.fill: parent
                onPaint: {
                    const ctx = getContext("2d")
                    ctx.reset()
                    ctx.fillStyle = Ui.Theme.surfaceCanvas
                    ctx.fillRect(0, 0, width, height)
                    if (!controller.valid) return
                    const geo = root.geometry
                    const rows = Math.ceil(height / root.rowHeight) + 1
                    for (let row = 0; row < rows; ++row) {
                        const pitch = geo.rows ? geo.rows.pitches[row + geo.topRow] : root.topPitch - row
                        if (pitch === undefined || pitch < 0) break
                        const y = row * root.rowHeight
                        if (Notes.isBlackKey(pitch)) {
                            ctx.fillStyle = Ui.Theme.actionSelected
                            ctx.fillRect(0, y, width, root.rowHeight)
                        }
                        // The B-C boundary marks the octave.
                        ctx.fillStyle = pitch % 12 === 0 ? Ui.Theme.borderStrong : Ui.Theme.borderSubtle
                        ctx.globalAlpha = pitch % 12 === 0 ? 0.45 : 1
                        ctx.fillRect(0, y + root.rowHeight - 1, width, 1)
                        ctx.globalAlpha = 1
                    }
                    const from = Notes.xToTick(0, geo), to = Notes.xToTick(width, geo)
                    // Bar lines are strong, beat lines medium and the lines at the snap step faint.
                    // A level whose spacing is under 4 px is skipped.
                    const faint = root.snapOn || root.snapValue === "smart" ? root.gridStepTicks : 0
                    if (faint > 0 && faint < root.beatTicks && faint * root.pxPerTick >= Ui.Metrics.xs) {
                        ctx.fillStyle = Ui.Theme.borderSubtle
                        for (const tick of Tools.stepLineTicks(from, to, faint, root.gridPhaseTick)) ctx.fillRect(Math.round(Notes.tickToX(tick, geo)), 0, 1, height)
                    }
                    if (root.beatTicks * root.pxPerTick >= Ui.Metrics.xs) {
                        ctx.fillStyle = Ui.Theme.borderStrong
                        ctx.globalAlpha = 0.3
                        for (const tick of controller.gridTicks("beat", from, to)) ctx.fillRect(Math.round(Notes.tickToX(tick, geo)), 0, 1, height)
                    }
                    if (controller.gridStepTicks("bar") * root.pxPerTick >= Ui.Metrics.xs) {
                        ctx.globalAlpha = 0.75
                        ctx.fillStyle = Ui.Theme.borderStrong
                        for (const tick of controller.gridTicks("bar", from, to)) ctx.fillRect(Math.round(Notes.tickToX(tick, geo)), 0, 1, height)
                    }
                    // Outside the clip window the notes are hidden from playback.
                    ctx.fillStyle = Ui.Theme.scrimModal
                    const left = Notes.tickToX(controller.windowFromTick, geo), right = Notes.tickToX(controller.windowToTick, geo)
                    ctx.globalAlpha = 0.5
                    if (left > 0) ctx.fillRect(0, 0, Math.min(width, left), height)
                    if (right < width) ctx.fillRect(Math.max(0, right), 0, width - Math.max(0, right), height)
                    ctx.globalAlpha = 1
                    const list = root.notes, selected = root.selectedSet
                    const clipMode = root.noteColorMode === "clip"
                    for (let i = 0; i < list.length; ++i) {
                        const r = Notes.noteRect(list[i], geo)
                        if (r.x > width || r.x + r.width < 0 || r.y > height || r.y + r.height < 0) continue
                        const isSelected = !!selected[list[i].id]
                        const muted = !!list[i].muted
                        const rgb = clipMode ? root.clipRgb : Notes.velocityColor(list[i].velocity)
                        // A selected note lights up toward white, as in Logic, and keeps a white frame.
                        const fill = Notes.mixColor(rgb, [255, 255, 255], isSelected ? 0.55 : 0)
                        const edge = isSelected ? Ui.Theme.textPrimary : Notes.mixColor(rgb, [0, 0, 0], 0.4)
                        // A note is a bar with a small radius and a one-pixel edge. The velocity line runs inside it.
                        const top = Math.round(r.y) + 1, h = Math.max(1, Math.round(r.height) - 2)
                        const nx = Math.round(r.x), nw = Math.max(1, Math.round(r.width) - 1)
                        const radius = Math.min(Ui.Metrics.micro, nw / 2, h / 2)
                        if (muted) {
                            // A muted note is hollow: a faint fill and an outline.
                            ctx.globalAlpha = 0.15
                            ctx.fillStyle = fill
                            ctx.fillRect(nx, top, nw, h)
                            ctx.globalAlpha = 0.7
                            ctx.strokeStyle = isSelected ? Ui.Theme.textPrimary : fill
                            ctx.lineWidth = 1
                            ctx.strokeRect(nx + 0.5, top + 0.5, Math.max(0, nw - 1), Math.max(0, h - 1))
                        } else {
                            ctx.fillStyle = edge
                            ctx.beginPath()
                            ctx.roundedRect(nx, top, nw, h, radius, radius)
                            ctx.fill()
                            ctx.fillStyle = fill
                            ctx.beginPath()
                            ctx.roundedRect(nx + 1, top + 1, Math.max(0, nw - 2), Math.max(0, h - 2), Math.max(0, radius - 1), Math.max(0, radius - 1))
                            ctx.fill()
                            // With Note Labels on, the name sits at the left when the note is wide and tall enough.
                            let lineX = nx + 2
                            const name = Notes.pitchName(list[i].pitch)
                            if (root.noteLabels && h >= Ui.Metrics.md && nw >= Ui.Metrics.xxxl) {
                                ctx.font = Ui.Typography.canvasFont(Ui.Typography.SansCaption)
                                ctx.textBaseline = "middle"
                                ctx.textAlign = "left"
                                ctx.fillStyle = Notes.mixColor(rgb, [0, 0, 0], 0.75)
                                ctx.fillText(name, nx + Ui.Metrics.xs, top + h / 2)
                                lineX = nx + Ui.Metrics.xs + ctx.measureText(name).width + Ui.Metrics.xs
                            }
                            const lineSpan = nx + nw - 2 - lineX
                            if (lineSpan >= 2 && h >= 5) {
                                ctx.fillStyle = Notes.mixColor(rgb, [0, 0, 0], 0.55)
                                ctx.fillRect(lineX, top + Math.floor(h / 2), Math.max(1, Math.round(lineSpan * list[i].velocity / 127)), 1)
                            }
                        }
                        ctx.globalAlpha = 1
                        const bend = list[i].expression ? list[i].expression.pitch : null
                        if (bend && bend.length > 0 && r.width > 2) {
                            // The note's pitch expression: a thin line, one row per semitone around the row centre.
                            ctx.strokeStyle = Ui.Theme.textPrimary
                            ctx.lineWidth = 1
                            ctx.beginPath()
                            const middle = r.y + r.height / 2
                            const yOf = v => Math.max(r.y + 1, Math.min(r.y + r.height - 1, middle - v * root.rowHeight))
                            ctx.moveTo(r.x, middle)
                            ctx.lineTo(r.x + bend[0].tick * root.pxPerTick, middle)
                            for (const p of bend) ctx.lineTo(r.x + p.tick * root.pxPerTick, yOf(p.value))
                            ctx.lineTo(r.x + r.width, yOf(bend[bend.length - 1].value))
                            ctx.stroke()
                        }
                    }
                    const m = gridMouse.marquee
                    if (m) {
                        const x1 = Notes.tickToX(m.fromTick, geo), x2 = Notes.tickToX(m.toTick, geo)
                        const y1 = Notes.pitchToY(Math.max(m.pitchA, m.pitchB), geo)
                        const y2 = Notes.pitchToY(Math.min(m.pitchA, m.pitchB), geo) + root.rowHeight
                        ctx.fillStyle = Ui.Theme.accentOutline
                        ctx.globalAlpha = 0.3
                        ctx.fillRect(Math.min(x1, x2), y1, Math.abs(x2 - x1), y2 - y1)
                        ctx.globalAlpha = 1
                        ctx.strokeStyle = Ui.Theme.accentPrimary
                        ctx.strokeRect(Math.min(x1, x2) + 0.5, y1 + 0.5, Math.abs(x2 - x1), y2 - y1)
                    }
                }
            }

            Rectangle {
                objectName: "pianoRollPlayhead"
                readonly property real px: root.clock ? Notes.tickToX(controller.timelineMsToTick(root.clock.time), root.geometry) : -1
                x: px
                width: Ui.Metrics.border
                height: parent.height
                color: Ui.Theme.accentPrimary
                visible: px >= 0 && px <= parent.width
            }

            MouseArea {
                id: gridMouse
                anchors.fill: parent
                hoverEnabled: true
                acceptedButtons: Qt.LeftButton
                cursorShape: Qt.CrossCursor
                property var drag: null
                property var marquee: null
                property var lastClick: null

                function cursorOf(tool, hit) {
                    switch (tool) {
                    case "pencil": case "brush": return Qt.CrossCursor
                    case "eraser": return Qt.ForbiddenCursor
                    case "scissors": return Qt.SplitHCursor
                    case "glue": case "mute": return Qt.PointingHandCursor
                    case "velocity": return Qt.SizeVerCursor
                    case "quantize": return Qt.WhatsThisCursor
                    default: return !hit ? Qt.ArrowCursor : hit.edge === "end" ? Qt.SizeHorCursor : Qt.OpenHandCursor
                    }
                }
                function toolFor(mouse) { return Tools.resolveTool(root.secondHeld(mouse), root.tool, root.altTool) }
                function endTickAt(tick, bypass) { return root.snapOrNot(tick, bypass) }

                // Removes the note under the pointer from the preview.
                function eraseAt(x, y) {
                    const hit = Notes.hitTest(root.notes, x, y, root.geometry)
                    if (!hit) return
                    root.liveNotes = Notes.removeNotes(root.notes, [hit.note.id])
                    root.selectedIds = root.selectedIds.filter(id => id !== hit.note.id)
                    drag.changed = true
                }
                // Paints one note per snap step at the row under the pointer, from the last painted step.
                function brushAt(x, y, bypass) {
                    const geo = root.geometry
                    const rawPitch = Notes.yToPitch(y, geo)
                    if (rawPitch < 0 || rawPitch > 127) return
                    const pitch = root.scaled(rawPitch)
                    const start = root.stepStart(Notes.xToTick(x, geo), bypass)
                    const from = drag.lastStart
                    const step = Math.max(1, Math.round(root.gridStepTicks))
                    const snapped = root.snapOn && !bypass
                    const positions = []
                    if (from === null || (start === from && pitch !== drag.lastPitch)) positions.push(start)
                    else if (snapped && start !== from) {
                        const direction = start > from ? 1 : -1
                        const lines = Tools.stepLineTicks(Math.min(from, start), Math.max(from, start), step, root.gridPhaseTick)
                        if (direction < 0) lines.reverse()
                        for (const line of lines) {
                            const at = Math.round(line)
                            if (at !== from) positions.push(at)
                            if (positions.length >= 512) break
                        }
                        if (positions.length < 512 && positions.indexOf(start) < 0) positions.push(start)
                    } else if (!snapped) {
                        const direction = start >= from ? 1 : -1
                        const count = Math.min(512, Math.floor(Math.abs(start - from) / step))
                        for (let i = 1; i <= count; ++i) positions.push(from + direction * i * step)
                        if (pitch !== drag.lastPitch && positions.indexOf(start) < 0) positions.push(start)
                    }
                    let list = root.notes
                    for (const at of positions) {
                        if (at >= 0 && !Tools.hasNoteAt(list, pitch, at) && list.length < controller.maxNotes) {
                            list = Tools.addStepNote(list, root.newId(), pitch, at, step)
                            drag.changed = true
                        }
                        drag.lastStart = at
                    }
                    if (positions.length > 0) { drag.lastPitch = pitch }
                    if (drag.changed) root.liveNotes = list
                }

                onPressed: mouse => {
                    root.forceActiveFocus()
                    root.laneFocused = false
                    const geo = root.geometry
                    const hit = Notes.hitTest(root.notes, mouse.x, mouse.y, geo)
                    const tick = Notes.xToTick(mouse.x, geo), pitch = Notes.yToPitch(mouse.y, geo)
                    const shift = (mouse.modifiers & Qt.ShiftModifier) !== 0
                    let tool = toolFor(mouse)
                    if (!controller.editable) tool = "pointer"
                    const bypass = root.bypassing(mouse)
                    const base = {selectionBefore: root.selectedIds.slice(), startTick: tick, startPitch: pitch, startX: mouse.x, startY: mouse.y, moved: false}
                    if (tool === "pointer" || (tool === "pencil" && hit)) {
                        if (hit) {
                            if (shift) {
                                root.selectedIds = root.selectedSet[hit.note.id]
                                    ? root.selectedIds.filter(id => id !== hit.note.id) : root.selectedIds.concat([hit.note.id])
                                return
                            }
                            let ids = root.selectedIds
                            if (!root.selectedSet[hit.note.id]) { ids = [hit.note.id]; root.selectedIds = ids }
                            if (!controller.editable) return
                            drag = Object.assign({kind: hit.edge === "end" ? "resize" : "move", ids: ids, baseline: root.notes.slice(),
                                    anchorTick: hit.edge === "end" ? hit.note.startTick + hit.note.durationTick : hit.note.startTick,
                                    duplicate: (mouse.modifiers & Qt.AltModifier) !== 0 && hit.edge !== "end"}, base)
                        } else {
                            drag = Object.assign({kind: "marquee", additive: shift, additiveIds: shift ? root.selectedIds.slice() : []}, base)
                        }
                        return
                    }
                    if (tool === "pencil") {
                        // A note one snap step long, then a drag sets its length.
                        if (pitch < 0 || pitch > 127) return
                        const applied = root.scaled(pitch)
                        if (applied < 0 || applied > 127) return
                        const start = root.stepStart(tick, bypass)
                        const step = Math.max(1, Math.round(root.gridStepTicks))
                        const note = {id: root.newId(), pitch: applied, velocity: 100, startTick: start,
                                      durationTick: step}
                        drag = Object.assign({kind: "pencil", note: note, start: start, step: step, baseline: root.notes.slice()}, base)
                        root.liveNotes = root.notes.concat([note])
                        root.selectedIds = [note.id]
                        return
                    }
                    if (tool === "eraser") {
                        drag = Object.assign({kind: "erase", changed: false}, base)
                        eraseAt(mouse.x, mouse.y)
                        return
                    }
                    if (tool === "brush") {
                        drag = Object.assign({kind: "brush", changed: false, lastStart: null}, base)
                        brushAt(mouse.x, mouse.y, bypass)
                        return
                    }
                    if (!hit) return
                    const clicked = hit.note.id
                    if (tool === "scissors") {
                        const split = Notes.splitNotes(root.notes, [clicked], root.snapOrNot(tick, bypass), root.newId)
                        if (split.notes.length !== root.notes.length && root.write(split.notes)) root.selectedIds = split.ids
                    } else if (tool === "glue") {
                        const glued = Notes.glueNotes(root.notes, root.selectedIds, clicked)
                        if (glued.length !== root.notes.length && root.write(glued)) {
                            const kept = {}
                            for (const note of glued) kept[note.id] = true
                            root.selectedIds = root.selectedIds.filter(id => kept[id])
                        }
                    } else if (tool === "mute") {
                        root.write(Tools.toggleMuteAt(root.notes, clicked, root.selectedIds))
                    } else if (tool === "velocity") {
                        const ids = root.selectedSet[clicked] ? root.selectedIds : [clicked]
                        if (!root.selectedSet[clicked]) root.selectedIds = ids
                        drag = Object.assign({kind: "velocity", ids: ids, baseline: root.notes.slice()}, base)
                    } else if (tool === "quantize") {
                        const ids = root.selectedSet[clicked] ? root.selectedIds : [clicked]
                        root.quantize("start", ids)
                    }
                }
                onPositionChanged: mouse => {
                    const geo = root.geometry
                    const tick = Notes.xToTick(mouse.x, geo), pitch = Notes.yToPitch(mouse.y, geo)
                    root.hoverPos = {tick: tick, pitch: pitch}
                    if (!drag) {
                        cursorShape = cursorOf(toolFor(mouse), Notes.hitTest(root.notes, mouse.x, mouse.y, geo))
                        return
                    }
                    if (drag.kind === "erase") { eraseAt(mouse.x, mouse.y); return }
                    if (drag.kind === "brush") { brushAt(mouse.x, mouse.y, root.bypassing(mouse)); return }
                    if (drag.kind !== "velocity" && !drag.moved && Math.abs(mouse.x - drag.startX) < root.dragThreshold && Math.abs(mouse.y - drag.startY) < root.dragThreshold) return
                    if (drag.kind === "marquee") {
                        drag.moved = true
                        marquee = {fromTick: drag.startTick, toTick: tick, pitchA: drag.startPitch, pitchB: pitch}
                        root.selectedIds = Array.from(new Set(drag.additiveIds.concat(Notes.notesInRect(root.notes, drag.startTick, tick, drag.startPitch, pitch))))
                        grid.requestPaint()
                        return
                    }
                    if (drag.kind === "pencil") {
                        drag.moved = true
                        const snapped = root.snapOn && !root.bypassing(mouse)
                        const length = Math.max(snapped ? drag.step : 1, root.snapOrNot(tick, root.bypassing(mouse)) - drag.start)
                        root.liveNotes = drag.baseline.concat([Notes.copyNote(drag.note, {durationTick: length})])
                        return
                    }
                    if (drag.kind === "velocity") {
                        drag.moved = true
                        root.liveNotes = Notes.shiftVelocity(drag.baseline, drag.ids, drag.startY - mouse.y)
                        return
                    }
                    if (!drag.moved && drag.duplicate) {
                        const count = drag.baseline.length
                        drag.baseline = Notes.duplicateNotes(drag.baseline, drag.ids, 0, root.newId)
                        drag.ids = drag.baseline.slice(count).map(note => note.id)
                        root.selectedIds = drag.ids
                    }
                    drag.moved = true
                    root.dragIds = drag.ids
                    cursorShape = drag.kind === "resize" ? Qt.SizeHorCursor : Qt.ClosedHandCursor
                    const bypass = root.bypassing(mouse)
                    const deltaTick = root.snapOrNot(drag.anchorTick + tick - drag.startTick, bypass) - drag.anchorTick
                    if (drag.kind === "resize") {
                        root.liveNotes = Notes.resizeNotes(drag.baseline, drag.ids, deltaTick, root.snapOn && !bypass ? root.gridStepTicks : 1)
                        return
                    }
                    let next
                    if (geo.rows) {
                        const deltaRows = geo.rows.index[pitch] - geo.rows.index[drag.startPitch]
                        next = Tools.moveNotesByRows(drag.baseline, drag.ids, deltaTick, deltaRows, geo.rows)
                    } else {
                        next = Notes.moveNotes(drag.baseline, drag.ids, deltaTick, pitch - drag.startPitch)
                    }
                    // A vertical move lands on the scale. A horizontal move never changes pitch.
                    if (root.snapToScale && root.scaleActive && pitch !== drag.startPitch) next = Notes.scaleQuantizeNotes(next, root.scaleRoot, root.scaleIv, drag.ids)
                    root.liveNotes = next
                }
                onReleased: mouse => {
                    const ended = drag
                    drag = null
                    marquee = null
                    root.dragIds = []
                    if (!ended) return
                    if (ended.kind === "marquee") {
                        grid.requestPaint()
                        // A click on empty grid clears the selection. It creates no note.
                        if (!ended.moved && !ended.additive) root.selectedIds = []
                        return
                    }
                    const live = root.liveNotes
                    root.liveNotes = null
                    grid.requestPaint()
                    if (live === null) return
                    if (ended.kind === "pencil") {
                        if (root.write(live)) lastClick = {id: ended.note.id, time: Date.now()}
                        else root.selectedIds = ended.selectionBefore
                    } else if (ended.kind === "erase" || ended.kind === "brush") {
                        if (ended.changed) root.write(live)
                    } else if (ended.moved) {
                        // No Overlap trims the notes the moved ones landed on, in the same undo step.
                        if (!root.write(root.dragMode === "nooverlap" && ended.kind !== "velocity" ? Notes.applyNoOverlap(live, ended.ids) : live) && ended.duplicate) root.selectedIds = ended.selectionBefore
                    }
                }
                onExited: root.hoverPos = null
                onCanceled: {
                    if (drag) root.selectedIds = drag.selectionBefore.filter(id => controller.notes.some(note => note.id === id))
                    drag = null
                    marquee = null
                    root.dragIds = []
                    root.liveNotes = null
                    grid.requestPaint()
                }
                onDoubleClicked: mouse => {
                    const tool = toolFor(mouse)
                    if (tool !== "pointer" && tool !== "pencil") return
                    // The press of a double click began a gesture that the delete ends.
                    drag = null
                    marquee = null
                    root.dragIds = []
                    root.liveNotes = null
                    if (!controller.editable) return
                    const hit = Notes.hitTest(root.notes, mouse.x, mouse.y, root.geometry)
                    if (!hit) return
                    // The second click of a fast double-click on empty grid lands on the note the first one wrote.
                    if (lastClick && lastClick.id === hit.note.id && Date.now() - lastClick.time < 500) return
                    root.write(Notes.removeNotes(root.notes, [hit.note.id]))
                    root.selectedIds = root.selectedIds.filter(id => id !== hit.note.id)
                }
                onWheel: wheel => {
                    const geo = root.geometry
                    const zoom = (wheel.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) !== 0
                    const dy = wheel.pixelDelta.y !== 0 ? wheel.pixelDelta.y : wheel.angleDelta.y / 4
                    const dx = wheel.pixelDelta.x !== 0 ? wheel.pixelDelta.x : wheel.angleDelta.x / 4
                    if (zoom && dy !== 0) {
                        const anchor = Notes.xToTick(wheel.x, geo)
                        const next = Math.min(root.maxPxPerTick, Math.max(root.minPxPerTick, geo.pxPerTick * (dy > 0 ? root.zoomStep : 1 / root.zoomStep)))
                        root.pxPerTick = next
                        root.scrollTick = Math.max(0, anchor - wheel.x / next)
                    } else if ((wheel.modifiers & Qt.ShiftModifier) !== 0 || dx !== 0) {
                        const delta = dx !== 0 ? dx : dy
                        // A scroll by the user during playback turns Catch off.
                        if (root.clock && root.clock.playing) root.catchOn = false
                        root.scrollTick = Math.max(0, root.scrollTick - delta / geo.pxPerTick)
                    } else if (dy !== 0) {
                        const rows = Math.sign(dy) * Math.max(1, Math.round(Math.abs(dy) / root.rowHeight))
                        if (geo.rows) root.collapseTopRow = Math.max(0, Math.min(Math.max(0, geo.rows.pitches.length - Math.floor(gridArea.height / root.rowHeight)), root.collapseTopRow - rows))
                        else root.topPitch = Notes.clampTopPitch(root.topPitch + rows, gridArea.height / root.rowHeight)
                    }
                    wheel.accepted = true
                }
            }
        }

        // The velocity scale in the keyboard column, beside the lane: 127 at the top, 64, and 0 on the baseline.
        Canvas {
            objectName: "pianoRollVelocityScale"
            visible: velocityLane.visible
            x: 0
            y: velocityLane.y
            width: root.keyboardWidth
            height: velocityLane.height
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                ctx.fillStyle = Ui.Theme.surfacePanel
                ctx.fillRect(0, 0, width, height)
                ctx.fillStyle = Ui.Theme.borderSubtle
                ctx.fillRect(0, 0, width, 1)
                ctx.fillRect(width - 1, 0, 1, height)
                const base = height - Ui.Metrics.xs, usable = base - Ui.Metrics.xs
                ctx.font = Ui.Typography.canvasFont(Ui.Typography.SansCaption)
                ctx.textAlign = "right"
                ctx.fillStyle = Ui.Theme.textSecondary
                const label = (value, baseline) => {
                    ctx.textBaseline = baseline
                    ctx.fillText(String(value), width - Ui.Metrics.sm, Math.round(base - usable * value / 127))
                }
                label(127, "top")
                label(64, "middle")
                label(0, "bottom")
            }
        }
        Canvas {
            id: velocityLane
            objectName: "pianoRollVelocity"
            visible: root.drawVisible && root.laneInfo.type === "velocity"
            x: root.keyboardWidth
            y: gridArea.y + gridArea.height + root.laneBarHeight
            width: gridArea.width
            height: root.velocityHeight
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                ctx.fillStyle = Ui.Theme.surfacePanel
                ctx.fillRect(0, 0, width, height)
                ctx.fillStyle = Ui.Theme.borderSubtle
                ctx.fillRect(0, 0, width, 1)
                const list = root.notes, selected = root.selectedSet, geo = root.geometry
                const head = Ui.Metrics.xs
                // Velocity 0 sits on a baseline one margin above the bottom, so every stem ends in view.
                const base = height - Ui.Metrics.xs
                const usable = base - head
                // Faint guides at a quarter, half and three quarters of full velocity, and the baseline.
                ctx.fillStyle = Ui.Theme.borderSubtle
                for (let q = 0; q < 4; ++q) ctx.fillRect(0, Math.round(base - usable * q / 4), width, 1)
                const clipMode = root.noteColorMode === "clip"
                // One stem per note with a round head, in the note's color. A selected note's head
                // is white with a ring in its color, and its stem is brighter.
                const drawStem = (note, isSelected) => {
                    const x = Math.round(Notes.tickToX(note.startTick, geo)) + 1
                    if (x < -head || x > width + head) return
                    const rgb = clipMode ? root.clipRgb : Notes.velocityColor(note.velocity)
                    const color = Notes.mixColor(rgb, [255, 255, 255], isSelected ? 0.35 : 0)
                    const y = base - usable * note.velocity / 127
                    ctx.globalAlpha = note.muted ? 0.4 : 1
                    ctx.fillStyle = color
                    ctx.fillRect(x - 1, y, Ui.Metrics.micro, base - y)
                    ctx.beginPath()
                    ctx.arc(x, y, head, 0, 2 * Math.PI)
                    ctx.fillStyle = isSelected ? Ui.Theme.textPrimary : color
                    ctx.fill()
                    if (isSelected) {
                        ctx.lineWidth = Ui.Metrics.micro
                        ctx.strokeStyle = color
                        ctx.stroke()
                    }
                    ctx.globalAlpha = 1
                }
                for (let i = 0; i < list.length; ++i) if (!selected[list[i].id]) drawStem(list[i], false)
                for (let i = 0; i < list.length; ++i) if (selected[list[i].id]) drawStem(list[i], true)
            }
            MouseArea {
                id: velocityMouse
                anchors.fill: parent
                property var gesture: null
                function velocityAt(y) { return Math.max(1, Math.min(127, Math.round(127 * (parent.height - y) / (parent.height - 2 * Ui.Metrics.xs)))) }
                function noteNear(x) {
                    const list = root.notes
                    let best = null, bestDistance = Ui.Metrics.sm
                    for (let i = list.length - 1; i >= 0; --i) {
                        const distance = Math.abs(Notes.tickToX(list[i].startTick, root.geometry) - x)
                        if (distance < bestDistance) { best = list[i]; bestDistance = distance }
                    }
                    return best
                }
                onPressed: mouse => {
                    root.forceActiveFocus()
                    root.laneFocused = false
                    const note = noteNear(mouse.x)
                    if (!note || !controller.editable) { mouse.accepted = !!note; return }
                    const ids = root.selectedSet[note.id] ? root.selectedIds : [note.id]
                    if (!root.selectedSet[note.id]) root.selectedIds = ids
                    gesture = {baseline: root.notes.slice(), ids: ids, anchor: note.velocity}
                    root.liveNotes = Notes.shiftVelocity(gesture.baseline, ids, velocityAt(mouse.y) - note.velocity)
                }
                onPositionChanged: mouse => {
                    if (gesture) root.liveNotes = Notes.shiftVelocity(gesture.baseline, gesture.ids, velocityAt(mouse.y) - gesture.anchor)
                }
                onReleased: {
                    if (gesture && root.liveNotes !== null) root.write(root.liveNotes)
                    gesture = null
                    root.liveNotes = null
                }
                onCanceled: { gesture = null; root.liveNotes = null }
            }
        }
        Rectangle {
            id: laneBar
            objectName: "pianoRollLaneBar"
            visible: root.drawVisible
            x: 0
            y: gridArea.y + gridArea.height
            width: body.width
            height: root.laneBarHeight
            color: Ui.Theme.surfacePanel
            Ui.Separator { anchors { left: parent.left; right: parent.right; top: parent.top } }
            Row {
                anchors { left: parent.left; leftMargin: Ui.Metrics.md; verticalCenter: parent.verticalCenter }
                spacing: Ui.Metrics.md
                Ui.Select {
                    objectName: "pianoRollLaneSelect"
                    width: Ui.Metrics.panelWidth / 2
                    density: Ui.EditorButton.Compact
                    accessibleName: qsTr("Lane")
                    options: Lanes.laneOptions(root.singleNoteSelected)
                    value: root.effectiveLane
                    onValueCommitted: next => { root.laneChoice = next; root.selectedPointIds = []; root.repaintLane() }
                }
                Ui.NumberField {
                    objectName: "pianoRollOtherCc"
                    visible: root.effectiveLane === "cc:other"
                    width: Ui.Metrics.xxxl * 2
                    density: Ui.EditorButton.Compact
                    accessibleName: qsTr("Controller number")
                    from: 0
                    to: 127
                    value: root.otherCc
                    onValueCommitted: next => { root.otherCc = Math.round(next); root.selectedPointIds = []; root.repaintLane() }
                }
                Ui.SegmentedControl {
                    objectName: "pianoRollInterpolation"
                    visible: root.laneInfo.type === "controller"
                    accessibleName: qsTr("Interpolation")
                    options: [{label: qsTr("Linear"), value: "linear"}, {label: qsTr("Step"), value: "step"}]
                    value: root.laneStep ? "step" : "linear"
                    onValueCommitted: next => root.setInterpolation(next)
                }
            }
        }

        Canvas {
            id: curveLane
            objectName: "pianoRollCurveLane"
            visible: root.drawVisible && root.laneInfo.type !== "velocity"
            x: root.keyboardWidth
            y: gridArea.y + gridArea.height + root.laneBarHeight
            width: gridArea.width
            height: root.velocityHeight
            function pixelOf(point) {
                return {x: Notes.tickToX(root.laneBaseTick + point.tick, root.geometry),
                        y: Lanes.valueToY(point.value, root.laneInfo.range, height, root.laneMargin)}
            }
            onPaint: {
                const ctx = getContext("2d")
                ctx.reset()
                ctx.fillStyle = Ui.Theme.surfacePanel
                ctx.fillRect(0, 0, width, height)
                ctx.fillStyle = Ui.Theme.borderSubtle
                ctx.fillRect(0, 0, width, 1)
                const info = root.laneInfo
                if (info.type === "velocity" || !controller.valid) return
                const geo = root.geometry
                const neutralY = Math.round(Lanes.valueToY(info.type === "expression" ? Lanes.rangeOf(info.key).neutral : 0, info.range, height, root.laneMargin))
                ctx.fillStyle = Ui.Theme.borderSubtle
                ctx.fillRect(0, neutralY, width, 1)
                let from = 0, to = width
                const note = root.editingNote
                if (info.type === "expression") {
                    if (!note) return
                    from = Notes.tickToX(note.startTick, geo)
                    to = Notes.tickToX(note.startTick + note.durationTick, geo)
                    ctx.globalAlpha = 0.15
                    ctx.fillStyle = Ui.Theme.accentPrimary
                    ctx.fillRect(from, 0, Math.max(1, to - from), height)
                    ctx.globalAlpha = 1
                }
                const points = root.lanePoints
                ctx.strokeStyle = Ui.Theme.accentPrimary
                ctx.lineWidth = 1
                if (points.length > 0) {
                    ctx.beginPath()
                    const first = pixelOf(points[0])
                    // Before the first point the curve is neutral (an expression) or silent (a controller).
                    if (info.type === "expression") { ctx.moveTo(from, neutralY); ctx.lineTo(first.x, neutralY); ctx.lineTo(first.x, first.y) }
                    else ctx.moveTo(first.x, first.y)
                    for (let i = 1; i < points.length; ++i) {
                        const p = pixelOf(points[i])
                        if (root.laneStep && info.type === "controller") ctx.lineTo(p.x, pixelOf(points[i - 1]).y)
                        ctx.lineTo(p.x, p.y)
                    }
                    // After the last point the value holds.
                    ctx.lineTo(Math.max(to, pixelOf(points[points.length - 1]).x), pixelOf(points[points.length - 1]).y)
                    ctx.stroke()
                }
                const chosen = Notes.idSet(root.selectedPointIds)
                for (const point of points) {
                    const p = pixelOf(point)
                    if (p.x < -root.pointSize || p.x > width + root.pointSize) continue
                    ctx.fillStyle = chosen[point.id] ? Ui.Theme.accentSecondary : Ui.Theme.accentPrimary
                    ctx.fillRect(Math.round(p.x - root.pointSize / 2), Math.round(p.y - root.pointSize / 2), root.pointSize, root.pointSize)
                }
            }
            MouseArea {
                id: laneMouse
                objectName: "pianoRollCurveMouse"
                anchors.fill: parent
                cursorShape: Qt.CrossCursor
                property var gesture: null
                property var lastAdded: null
                function bypass(mouse) { return root.bypassing(mouse) }
                function absTick(x) { return Notes.xToTick(x, root.geometry) }
                function maxTick() { return root.editingNote ? root.editingNote.durationTick : undefined }
                // The lane tick under x, inside the lane: never before 0 or past the note's end.
                function relTick(x, snap) {
                    const abs = snap ? root.snapOrNot(absTick(x), false) : Math.round(absTick(x))
                    const limit = maxTick()
                    const tick = Math.max(0, abs - root.laneBaseTick)
                    return limit === undefined ? tick : Math.min(limit, tick)
                }
                function valueAt(y) { return Lanes.yToValue(y, root.laneInfo.range, height, root.laneMargin) }
                onPressed: mouse => {
                    root.forceActiveFocus()
                    root.laneFocused = true
                    if (!controller.editable || (root.laneInfo.type === "expression" && !root.editingNote)) return
                    const points = root.lanePoints
                    const hit = Lanes.hitPoint(points, mouse.x, mouse.y, curveLane.pixelOf, root.pointSize)
                    const shift = (mouse.modifiers & Qt.ShiftModifier) !== 0
                    const before = root.selectedPointIds.slice()
                    if (shift && !hit) {
                        const tick = relTick(mouse.x, !bypass(mouse))
                        gesture = {kind: "draw", lastTick: tick, lastValue: valueAt(mouse.y)}
                        root.applyLanePoints(Lanes.drawPoint(points, tick, gesture.lastValue, root.laneInfo.range, root.newId, maxTick()))
                        return
                    }
                    if (hit) {
                        const ids = root.selectedPointIds.indexOf(hit.id) >= 0 ? root.selectedPointIds : [hit.id]
                        root.selectedPointIds = ids
                        gesture = {kind: "move", ids: ids, baseline: points, anchorTick: root.laneBaseTick + hit.tick,
                                   startTick: absTick(mouse.x), startValue: valueAt(mouse.y), moved: false,
                                   pressX: mouse.x, pressY: mouse.y, before: before}
                        return
                    }
                    // A click on empty lane adds a point; dragging moves it before the release writes it.
                    const tick = Math.max(0, relTick(mouse.x, !bypass(mouse)))
                    const id = root.newId()
                    const next = Lanes.addPoint(points, tick, valueAt(mouse.y), root.laneInfo.range, id, maxTick())
                    if (next.length === points.length) return
                    root.selectedPointIds = [id]
                    root.applyLanePoints(next, [id])
                    // An expression curve keeps index ids, so the hit test of the second click sees "e<i>".
                    lastAdded = {id: root.laneInfo.type === "expression" ? "e" + next.findIndex(point => point.id === id) : id, time: Date.now()}
                    gesture = {kind: "move", ids: [id], baseline: next, anchorTick: root.laneBaseTick + tick,
                               startTick: absTick(mouse.x), startValue: valueAt(mouse.y), moved: false,
                               pressX: mouse.x, pressY: mouse.y, before: before}
                }
                onPositionChanged: mouse => {
                    if (!gesture) return
                    if (gesture.kind === "draw") {
                        // Fill every grid step between the last mouse position and this one.
                        // No finer than one point per screen pixel.
                        const step = Math.max(root.snapOn && !bypass(mouse) ? root.gridStepTicks : 1, 1 / root.pxPerTick)
                        const tick = relTick(mouse.x, !bypass(mouse)), value = valueAt(mouse.y)
                        const points = Lanes.drawSegment(root.lanePoints, gesture.lastTick, gesture.lastValue, tick, value, step,
                                                         root.laneInfo.range, root.newId, maxTick())
                        gesture.lastTick = tick
                        gesture.lastValue = value
                        root.applyLanePoints(points)
                        return
                    }
                    // A press becomes a drag only past the threshold the note grid uses.
                    if (!gesture.moved && Math.abs(mouse.x - gesture.pressX) < root.dragThreshold && Math.abs(mouse.y - gesture.pressY) < root.dragThreshold) return
                    gesture.moved = true
                    const deltaTick = root.snapOrNot(gesture.anchorTick + absTick(mouse.x) - gesture.startTick, bypass(mouse)) - gesture.anchorTick
                    root.applyLanePoints(Lanes.movePoints(gesture.baseline, gesture.ids, deltaTick, valueAt(mouse.y) - gesture.startValue,
                                                          root.laneInfo.range, maxTick()), gesture.ids)
                }
                onReleased: {
                    const ended = gesture
                    gesture = null
                    if (!ended) return
                    root.commitLane()
                }
                onCanceled: {
                    // A cancelled drag restores the selection it began with.
                    if (gesture && gesture.before) root.selectedPointIds = gesture.before
                    gesture = null
                    root.liveControllers = null
                    root.liveNotes = null
                    curveLane.requestPaint()
                }
                onDoubleClicked: mouse => {
                    if (!controller.editable) return
                    const hit = Lanes.hitPoint(root.lanePoints, mouse.x, mouse.y, curveLane.pixelOf, root.pointSize)
                    if (!hit) return
                    // The second click of a fast double-click lands on the point the first one wrote.
                    if (lastAdded && lastAdded.id === hit.id && Date.now() - lastAdded.time < 500) return
                    gesture = null  // the delete ends the gesture the second press began
                    root.applyLanePoints(Lanes.removePoints(root.lanePoints, [hit.id]))
                    root.commitLane()
                    root.selectedPointIds = root.selectedPointIds.filter(id => id !== hit.id)
                }
            }
        }
    }

    // Every input of a drawing asks for a repaint of the canvases that read it.
    function repaint() { grid.requestPaint(); repaintLane(); ruler.requestPaint(); keyboard.requestPaint() }
    onNotesChanged: { grid.requestPaint(); repaintLane() }
    onSelectedIdsChanged: {
        grid.requestPaint()
        repaintLane()
        // Index ids of one note's curve mean nothing on another note.
        const edited = selectedIds.length === 1 ? selectedIds[0] : ""
        if (edited !== expressionNoteId) {
            expressionNoteId = edited
            if (laneInfo.type === "expression") selectedPointIds = []
        }
    }
    onControllersChanged: curveLane.requestPaint()
    onLanePointsChanged: curveLane.requestPaint()
    onSelectedPointIdsChanged: curveLane.requestPaint()
    onGeometryChanged: repaint()
    onGridStepTicksChanged: grid.requestPaint()
    onSnapOnChanged: grid.requestPaint()
    onNoteColorModeChanged: grid.requestPaint()
    onClipAccentChanged: grid.requestPaint()
    Connections {
        target: controller
        function onClipChanged() { root.repaint() }
    }
    Connections {
        target: Ui.Theme
        function onDarkChanged() { root.repaint() }
    }
}

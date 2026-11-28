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
import NodeTool.TimelinePlayer
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
    readonly property ClipGestureController gestures: region ? region.gestures : null
    readonly property PlaybackClock clock: editor ? editor.clock : null
    readonly property var undoStack: controller.timeline ? controller.timeline.undoStack : null
    readonly property bool canUndo: !!undoStack && undoStack.canUndo
    readonly property bool canRedo: !!undoStack && undoStack.canRedo
    readonly property bool controllerEditable: controller.editable
    function setRegionParam(key, value) {
        if (!controllerEditable || !controller.timeline) return
        const params = {clipId: clipId}
        params[key] = value
        controller.timeline.applyEdit("set_clip_params", params)
    }
    readonly property var regionParams: controller.regionParams
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

    readonly property PianoRollController noteController: controller
    component PianoLayer: NoteLayerItem {
        id: drawing
        Component.onCompleted: {
            setCollapsePitches(root.rowSet ? root.rowSet.pitches : [])
            if (drawingKind === "curve") { setCurvePoints(root.lanePoints) }
        }
        Connections {
            target: root
            function onRowSetChanged() { drawing.setCollapsePitches(root.rowSet ? root.rowSet.pitches : []) }
            function onLanePointsChanged() { if (drawing.drawingKind === "curve") { drawing.setCurvePoints(root.lanePoints) } }
        }
        controller: root.noteController
        clip: true
        pxPerTick: root.pxPerTick
        scrollTick: root.scrollTick
        rowHeight: root.rowHeight
        topPitch: root.topPitch
        collapseTopRow: root.geometry.topRow
        selectedIds: root.selectedIds
        clipColors: root.noteColorMode === "clip"
        noteLabels: root.noteLabels
        dark: Ui.Theme.dark
        stepTicks: root.snapOn || root.snapValue === "smart" ? root.gridStepTicks : 0
        phaseTick: root.gridPhaseTick
        collapsed: root.collapseMode
        margin: drawingKind === "curve" ? root.laneMargin : Ui.Metrics.xs
        micro: Ui.Metrics.micro
        pointSize: root.pointSize
        labelMinWidth: Ui.Metrics.xxxl
        scaleInset: Ui.Metrics.sm
        labelFont: Ui.Typography.font(Ui.Typography.SansCaption)
        background: Ui.Theme.surfaceCanvas
        panelColor: Ui.Theme.surfacePanel
        selectedColor: Ui.Theme.actionSelected
        borderSubtle: Ui.Theme.borderSubtle
        borderStrong: Ui.Theme.borderStrong
        borderControl: Ui.Theme.borderControl
        scrim: Ui.Theme.scrimModal
        textPrimary: Ui.Theme.textPrimary
        textSecondary: Ui.Theme.textSecondary
        textOnAccent: Ui.Theme.textOnAccent
        accent: Ui.Theme.accentPrimary
        accentSecondary: Ui.Theme.accentSecondary
        accentOutline: Ui.Theme.accentOutline
        clipAccent: root.clipAccent
        marqueeVisible: drawingKind === "notes" && gridMouse.marquee !== null
        marquee: marqueeVisible ? Qt.rect(gridMouse.marquee.fromTick, gridMouse.marquee.pitchA,
            gridMouse.marquee.toTick - gridMouse.marquee.fromTick, gridMouse.marquee.pitchB - gridMouse.marquee.pitchA) : Qt.rect(0, 0, 0, 0)
        selectedPointIds: drawingKind === "curve" ? root.selectedPointIds : []
        curveMin: root.laneInfo.range ? root.laneInfo.range.min : 0
        curveMax: root.laneInfo.range ? root.laneInfo.range.max : 127
        curveNeutral: root.laneInfo.type === "expression" ? root.laneInfo.range.neutral : 0
        curveBaseTick: root.laneBaseTick
        curveEndTick: root.editingNote ? root.editingNote.startTick + root.editingNote.durationTick : 0
        expression: root.laneInfo.type === "expression"
        curveStep: root.laneStep
    }

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
        if (gestures.clipMediaType(selection[0]) === "midi" && controller.clipId !== selection[0]) controller.clipId = selection[0]
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
        onNotesReset: { root.cancelNotePreview(); root.pruneSelection() }
        onNotesPatched: ids => { root.cancelNotePreview(); root.pruneSelection() }
        onToolChanged: root.toolRevision += 1
        onControllersChanged: root.pruneSelection()
        onClipChanged: {
            root.cancelNotePreview()
            root.pruneSelection()
            if (!valid) return
            if (root.scaleRootClip !== clipId) {
                root.scaleRootClip = clipId
                root.scaleRoot = Tools.defaultScaleRoot(keyTonic)
            }
            root.pruneSelection()
            root.frameIfNeeded()
        }
    }

    onVisibleChanged: { if (!visible) root.cancelNotePreview() }
    Component.onDestruction: controller.cancelNoteDrag()
    function cancelIfFocusOutside() {
        let focused = root.Window.window ? root.Window.window.activeFocusItem : null
        while (focused) {
            if (focused === root) return
            focused = focused.parent
        }
        root.cancelNotePreview()
    }
    Connections {
        target: root.Window.window
        function onActiveFocusItemChanged() { root.cancelIfFocusOutside() }
        function onActiveChanged() { if (!root.Window.window.active) root.cancelNotePreview() }
    }

    // ── View state ───────────────────────────────────────────────────────
    property real pxPerTick: 0.05
    property real scrollTick: 0
    property int topPitch: 72
    property int collapseTopRow: 0
    property bool framed: false
    property var selectedIds: []
    property int toolRevision: 0
    readonly property var selectedSet: Notes.idSet(selectedIds)
    readonly property var rowSet: {
        if (!collapseMode) return null
        const pitches = controller.noteSummary.pitches
        if (pitches.length === 0) return null
        const index = {}
        for (let i = 0; i < pitches.length; ++i) index[pitches[i]] = i
        return {pitches: pitches, index: index}
    }
    readonly property var geometry: ({pxPerTick: pxPerTick, scrollTick: scrollTick, rowHeight: rowHeight, topPitch: topPitch,
                                      rows: rowSet, topRow: rowSet ? Math.max(0, Math.min(collapseTopRow, rowSet.pitches.length - Math.floor(gridArea.height / rowHeight))) : 0})
    readonly property real beatTicks: controller.valid ? controller.gridStepTicks("beat") : 960
    readonly property real smartTicks: Notes.smartSnapTicks(pxPerTick, beatTicks, controller.beatsPerBar)
    readonly property real gridStepTicks: !controller.valid ? 960 : snapValue === "smart" ? smartTicks : controller.gridStepTicks(snapValue)
    readonly property real gridPhaseTick: controller.valid ? controller.timelineMsToTick(controller.offsetMs) : 0
    property var clipboard: []
    // The pointer over the grid, and the notes a drag is moving. Both feed the position display.
    property real hoverTick: 0
    property int hoverPitch: -1
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
    readonly property var channelState: Notes.commonValue(selectedNotes(), selectedIds, "channel", 0)
    readonly property var releaseState: Notes.commonValue(selectedNotes(), selectedIds, "releaseVelocity", 0)
    // The velocity slider follows the earliest selected note, including its preview.
    readonly property int shownVelocity: {
        let first = null
        for (const note of selectedNotes()) {
            if (selectedSet[note.id] && (first === null || note.startTick < first.startTick)) {
                first = controller.noteDragActive ? controller.previewNote(note.id) : note
            }
        }
        if (controller.noteDragActive) {
            for (const id of controller.noteDragIds()) {
                if (!selectedSet[id]) continue
                const note = controller.previewNote(id)
                if (first === null || note.startTick < first.startTick) first = note
            }
        }
        return first ? first.velocity : 100
    }

    readonly property string positionText: {
        if (!controller.valid) return ""
        let pitch = null, tick = null
        if (dragIds.length > 0) {
            const note = controller.noteDragActive ? controller.previewNote(dragIds[0]) : controller.noteById(dragIds[0])
            if (note && note.pitch >= 0) { pitch = note.pitch; tick = note.startTick }
        } else if (hoverPitch >= 0) {
            pitch = hoverPitch
            tick = hoverTick
        } else {
            let first = null
            for (const note of selectedNotes()) if (selectedSet[note.id] && (first === null || note.startTick < first.startTick)) { first = note }
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
        topPitch = initialTopPitch()
        collapseTopRow = 0
        selectedIds = []
    }
    function setZoomFromSlider(t) { pxPerTick = Tools.sliderToZoom(t, minPxPerTick, maxPxPerTick) }
    function zoomToFit() {
        if (!controller.valid || gridArea.width <= 0) return
        const summary = controller.noteSummary
        const low = summary.from, high = summary.to
        const span = Math.max(1, high - low)
        pxPerTick = Math.min(maxPxPerTick, Math.max(minPxPerTick, gridArea.width / (span * 1.1)))
        scrollTick = Math.max(0, low - span * 0.05)
        topPitch = initialTopPitch()
        collapseTopRow = 0
    }

    function cancelNotePreview() {
        if (gridMouse.drag) {
            root.selectedIds = gridMouse.drag.selectionBefore
            gridMouse.drag = null
        }
        gridMouse.marquee = null
        controller.cancelTool()
        root.dragIds = []
        root.velocityGesture = null
        velocityMouse.gesture = null
        controller.cancelNoteDrag()
    }

    function initialTopPitch() {
        const summary = controller.noteSummary
        const rows = Math.max(1, Math.floor(gridArea.height / rowHeight))
        return Notes.clampTopPitch(Math.round((summary.low + summary.high) / 2 + rows / 2), rows)
    }

    function pruneSelection() {
        // A pending refresh must not remove the ids owned by an uncommitted gesture.
        if (gridMouse.drag || controller.noteDragActive || controller.toolActive || liveControllers !== null) { return }
        const keptIds = controller.selectNotes("keep", root.selectedIds)
        if (keptIds.length !== root.selectedIds.length) { root.selectedIds = keptIds }
        if (root.laneInfo.type === "controller") {
            const pointIds = {}
            for (const lane of root.controllers) for (const point of lane.points) pointIds[point.id] = true
            root.selectedPointIds = root.selectedPointIds.filter(id => pointIds[id])
        } else if (root.laneInfo.type === "expression") {
            // Expression points carry index ids. Keep the ones the edited note still has.
            const target = root.selectedIds.length === 1 ? controller.noteById(root.selectedIds[0]) : null
            const curve = target && target.expression ? target.expression[root.laneInfo.key] : null
            const count = curve ? curve.length : 0
            root.selectedPointIds = root.selectedPointIds.filter(id => parseInt(String(id).substring(1), 10) < count)
        } else if (root.selectedPointIds.length > 0) {
            root.selectedPointIds = []
        }
    }

    function write(next, replacedIds) {
        return controller.patchSelection(next, replacedIds === undefined ? selectedIds : replacedIds)
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
            controller.previewExpression(editingNote.id, laneInfo.key, points)
            if (chosen) selectedPointIds = chosen.map(id => points.findIndex(point => point.id === id)).filter(i => i >= 0).map(i => "e" + i)
        }
        curveLane.requestPaint()
    }
    // Writes the lane gesture as one undo entry.
    function commitLane() {
        if (liveControllers !== null) writeControllers(liveControllers)
        else if (controller.toolActive) controller.commitTool()
        liveControllers = null
        controller.cancelTool()
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
    function pickNote(x, y, geo) {
        const hit = grid.hitNote(x, y)
        const note = hit === 0 ? null : controller.noteAtRow(Math.floor((hit - 1) / 2))
        return note && note.id ? {note: note, edge: hit % 2 === 0 ? "end" : "body"} : null
    }
    function selectedNotes() {
        // Scalar notification dependencies keep inspector values current without a note-list binding.
        const revision = controller.noteRevision
        const active = controller.toolActive
        const toolRevision = root.toolRevision
        return controller.selectedNotes(selectedIds)
    }
    function newId() { return controller.newNoteId() }
    function allIds() { return controller.selectNotes("all") }
    function setNoteField(field, value) {
        const patch = {}
        patch[field] = value
        write(Notes.patchNotes(selectedNotes(), selectedIds, patch))
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
        write(Notes.quantizeWith(controller.selectedNotes(chosen), chosen, quantizeOptions(target)), chosen)
    }
    function chooseQuantizeValue(value) {
        quantizeValue = value
        if (selectedIds.length > 0) quantize("start", selectedIds)
    }
    function scaleQuantize() {
        if (!scaleActive || !controller.editable) return
        const chosen = selectedIds.length > 0 ? selectedIds : allIds()
        if (chosen.length > 0) write(Notes.scaleQuantizeNotes(controller.selectedNotes(chosen), scaleRoot, scaleIv, chosen), chosen)
    }
    property var velocityGesture: null
    function velocityBegin() {
        const shown = shownVelocity
        velocityGesture = controller.beginNoteDrag(selectedIds, "velocity") ? {shown: shown} : null
    }
    // Every selected note shifts by one shared delta, which stops where the first note hits 1 or 127.
    function velocityPreview(value) {
        if (!velocityGesture) velocityBegin()
        if (!velocityGesture) return
        controller.updateNoteDrag(value - velocityGesture.shown, 0)
    }
    function velocityCommit(value) {
        if (!velocityGesture) velocityBegin()
        if (!velocityGesture) return
        controller.updateNoteDrag(value - velocityGesture.shown, 0)
        velocityGesture = null
        controller.commitNoteDrag()
    }
    function velocityCancel() { velocityGesture = null; controller.cancelNoteDrag() }

    function runAction(id) {
        const current = selectedNotes(), ids = selectedIds
        if (!controller.valid) return
        switch (id) {
        case "undo": if (undoStack) undoStack.undo(); return
        case "redo": if (undoStack) undoStack.redo(); return
        case "copy": if (ids.length > 0) clipboard = selectedNotes(); return
        case "selectAll": selectedIds = allIds(); return
        case "deselectAll": selectedIds = []; return
        case "selectFollowing": selectedIds = controller.selectNotes("following", ids, playheadTick()); return
        case "selectSamePitch": selectedIds = controller.selectNotes("samePitch", ids); return
        case "selectMuted": selectedIds = controller.selectNotes("muted"); return
        case "invertSelection": selectedIds = controller.selectNotes("invert", ids); return
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
            if (write(copies, [])) selectedIds = copies.map(note => note.id)
            return
        }
        if (ids.length === 0) return
        switch (id) {
        case "cut": clipboard = selectedNotes(); controller.removeNotes(ids); selectedIds = []; break
        case "delete": controller.removeNotes(ids); selectedIds = []; break
        case "mute": write(Notes.toggleMute(current, ids)); break
        case "transposeUp": write(Notes.moveNotes(current, ids, 0, 1)); break
        case "transposeDown": write(Notes.moveNotes(current, ids, 0, -1)); break
        case "octaveUp": write(Notes.moveNotes(current, ids, 0, 12)); break
        case "octaveDown": write(Notes.moveNotes(current, ids, 0, -12)); break
        case "forceLegato": controller.finishNotes("forceLegato", ids); break
        case "removeOverlaps": controller.finishNotes("removeOverlaps", ids); break
        case "deleteDuplicates":
            controller.finishNotes("deleteDuplicates", ids)
            selectedIds = controller.selectNotes("keep", selectedIds)
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
        const current = root.selectedNotes()
        if (event.key === Qt.Key_Escape && (controller.noteDragActive || gridMouse.drag || root.velocityGesture)) {
            root.cancelNotePreview()
            event.accepted = true
            return
        }
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
            root.selectedIds = controller.splitNotes(ids, root.playheadTick())
            event.accepted = true
        } else if (ctrl && (event.key === Qt.Key_D || event.key === Qt.Key_R)) {
            const chosen = root.selectedNotes()
            let low = Infinity, high = 0
            for (const note of chosen) { low = Math.min(low, note.startTick); high = Math.max(high, note.startTick + note.durationTick) }
            const next = Notes.duplicateNotes(current, ids, high - low, root.newId)
            if (root.write(next.slice(current.length), [])) root.selectedIds = next.slice(current.length).map(note => note.id)
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

        PianoLayer {
            drawingKind: "keyboard"
            id: keyboard
            objectName: "pianoRollKeyboard"
            x: 0
            y: root.gridTop
            width: root.keyboardWidth
            height: gridArea.height
            // The key under the pointer, and the key held down. Each takes the accent tint.

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
                    const ids = controller.selectNotes("pitch", [], pitch)
                    root.selectedIds = mouse.modifiers & Qt.ShiftModifier
                        ? Array.from(new Set(root.selectedIds.concat(ids))) : ids
                }
                onReleased: keyboard.pressedPitch = -1
                onCanceled: keyboard.pressedPitch = -1
            }
        }

        PianoLayer {
            drawingKind: "ruler"
            id: ruler
            objectName: "pianoRollRuler"
            x: root.keyboardWidth
            y: 0
            width: gridArea.width
            height: root.rulerHeight

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

            PianoLayer {
            drawingKind: "notes"
                id: grid
                objectName: "pianoRollNoteLayer"
                anchors.fill: parent

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
                objectName: "pianoRollGridMouse"
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
                    const hit = root.pickNote(x, y, root.geometry)
                    if (!hit) return
                    controller.previewErase(hit.note.id)
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
                    for (const at of positions) {
                        if (at >= 0 && controller.previewAdd(pitch, at, step, true)) drag.changed = true
                        drag.lastStart = at
                    }
                    if (positions.length > 0) drag.lastPitch = pitch
                }

                onPressed: mouse => {
                    root.forceActiveFocus()
                    root.laneFocused = false
                    const geo = root.geometry
                    const hit = root.pickNote(mouse.x, mouse.y, geo)
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
                            drag = Object.assign({kind: hit.edge === "end" ? "resize" : "move", ids: ids,
                                    anchorTick: hit.edge === "end" ? hit.note.startTick + hit.note.durationTick : hit.note.startTick,
                                    duplicate: (mouse.modifiers & Qt.AltModifier) !== 0 && hit.edge !== "end"}, base)
                            if (!drag.duplicate) {
                                drag.typed = controller.beginNoteDrag(ids, drag.kind)
                                if (!drag.typed) { drag = null }
                            }
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
                        if (!controller.beginTool("pencil")) return
                        const id = controller.previewAdd(applied, start, step)
                        if (!id) { controller.cancelTool(); return }
                        drag = Object.assign({kind: "pencil", noteId: id, start: start, step: step}, base)
                        root.selectedIds = [id]
                        return
                    }
                    if (tool === "eraser") {
                        if (!controller.beginTool("erase")) return
                        drag = Object.assign({kind: "erase", changed: false}, base)
                        eraseAt(mouse.x, mouse.y)
                        return
                    }
                    if (tool === "brush") {
                        if (!controller.beginTool("brush")) return
                        drag = Object.assign({kind: "brush", changed: false, lastStart: null}, base)
                        brushAt(mouse.x, mouse.y, bypass)
                        return
                    }
                    if (!hit) return
                    const clicked = hit.note.id
                    if (tool === "scissors") {
                        root.selectedIds = controller.splitNotes([clicked], root.snapOrNot(tick, bypass))
                    } else if (tool === "glue") {
                        const ids = Array.from(new Set(root.selectedIds.concat([clicked])))
                        if (controller.glueNotes(ids)) root.selectedIds = controller.selectNotes("keep", root.selectedIds)
                    } else if (tool === "mute") {
                        const ids = root.selectedSet[clicked] ? root.selectedIds : [clicked]
                        root.write(Tools.toggleMuteAt(controller.selectedNotes(ids), clicked, ids), ids)
                    } else if (tool === "velocity") {
                        const ids = root.selectedSet[clicked] ? root.selectedIds : [clicked]
                        if (!root.selectedSet[clicked]) root.selectedIds = ids
                        if (controller.beginNoteDrag(ids, "velocity")) {
                            drag = Object.assign({kind: "velocity", ids: ids, typed: true}, base)
                        }
                    } else if (tool === "quantize") {
                        const ids = root.selectedSet[clicked] ? root.selectedIds : [clicked]
                        root.quantize("start", ids)
                    }
                }
                onPositionChanged: mouse => {
                    const geo = root.geometry
                    const tick = Notes.xToTick(mouse.x, geo), pitch = Notes.yToPitch(mouse.y, geo)
                    root.hoverTick = tick
                    root.hoverPitch = pitch
                    if (drag && drag.typed && !controller.noteDragActive) { drag = null }
                    if (!drag) {
                        cursorShape = cursorOf(toolFor(mouse), root.pickNote(mouse.x, mouse.y, geo))
                        return
                    }
                    if (drag.kind === "erase") { eraseAt(mouse.x, mouse.y); return }
                    if (drag.kind === "brush") { brushAt(mouse.x, mouse.y, root.bypassing(mouse)); return }
                    if (drag.kind !== "velocity" && !drag.moved && Math.abs(mouse.x - drag.startX) < root.dragThreshold && Math.abs(mouse.y - drag.startY) < root.dragThreshold) return
                    if (drag.kind === "marquee") {
                        drag.moved = true
                        marquee = {fromTick: drag.startTick, toTick: tick, pitchA: drag.startPitch, pitchB: pitch}
                        root.selectedIds = Array.from(new Set(drag.additiveIds.concat(grid.notesInRect(drag.startTick, tick, drag.startPitch, pitch))))
                        return
                    }
                    if (drag.kind === "pencil") {
                        drag.moved = true
                        const snapped = root.snapOn && !root.bypassing(mouse)
                        const length = Math.max(snapped ? drag.step : 1, root.snapOrNot(tick, root.bypassing(mouse)) - drag.start)
                        controller.previewLength(drag.noteId, length)
                        return
                    }
                    if (drag.kind === "velocity") {
                        drag.moved = true
                        controller.updateNoteDrag(drag.startY - mouse.y, 0)
                        return
                    }
                    if (!drag.moved && drag.duplicate) {
                        drag.typed = controller.beginNoteDrag(drag.ids, "duplicate")
                        if (!drag.typed) { drag = null; return }
                        drag.ids = controller.noteDragIds()
                        root.selectedIds = drag.ids
                    }
                    drag.moved = true
                    root.dragIds = drag.ids
                    cursorShape = drag.kind === "resize" ? Qt.SizeHorCursor : Qt.ClosedHandCursor
                    const bypass = root.bypassing(mouse)
                    const deltaTick = root.snapOrNot(drag.anchorTick + tick - drag.startTick, bypass) - drag.anchorTick
                    if (controller.noteDragActive) {
                        const rows = geo.rows ? geo.rows.pitches : []
                        const deltaPitch = geo.rows ? geo.rows.index[pitch] - geo.rows.index[drag.startPitch] : pitch - drag.startPitch
                        const scale = []
                        if (root.snapToScale && root.scaleActive && pitch !== drag.startPitch) {
                            const classes = new Set(root.scaleIv)
                            for (let p = 0; p < 128; ++p) { if (classes.has(((p - root.scaleRoot) % 12 + 12) % 12)) { scale.push(p) } }
                        }
                        controller.updateNoteDrag(deltaTick, deltaPitch,
                            drag.kind === "resize" && root.snapOn && !bypass ? root.gridStepTicks : 1, rows, scale)
                        return
                    }
                }
                onReleased: mouse => {
                    const ended = drag
                    drag = null
                    marquee = null
                    root.dragIds = []
                    if (!ended) return
                    if (ended.kind === "marquee") {
                        // A click on empty grid clears the selection. It creates no note.
                        if (!ended.moved && !ended.additive) root.selectedIds = []
                        return
                    }
                    if (controller.noteDragActive) {
                        if (ended.moved) {
                            if (!controller.commitNoteDrag(root.dragMode === "nooverlap") && ended.duplicate) { root.selectedIds = ended.selectionBefore }
                        }
                        else { controller.cancelNoteDrag() }
                        return
                    }
                    if (ended.kind === "pencil") {
                        if (controller.commitTool()) lastClick = {id: ended.noteId, time: Date.now()}
                        else root.selectedIds = ended.selectionBefore
                    } else if (ended.kind === "erase" || ended.kind === "brush") {
                        if (ended.changed) controller.commitTool()
                        else controller.cancelTool()
                    }
                }
                onExited: root.hoverPitch = -1
                onCanceled: {
                    if (drag) root.selectedIds = controller.selectNotes("keep", drag.selectionBefore)
                    drag = null
                    marquee = null
                    root.dragIds = []
                    controller.cancelTool()
                    controller.cancelNoteDrag()
                }
                onDoubleClicked: mouse => {
                    const tool = toolFor(mouse)
                    if (tool !== "pointer" && tool !== "pencil") return
                    // The press of a double click began a gesture that the delete ends.
                    drag = null
                    marquee = null
                    root.dragIds = []
                    controller.cancelTool()
                    if (!controller.editable) return
                    const hit = root.pickNote(mouse.x, mouse.y, root.geometry)
                    if (!hit) return
                    controller.cancelNoteDrag()
                    // The second click of a fast double-click on empty grid lands on the note the first one wrote.
                    if (lastClick && lastClick.id === hit.note.id && Date.now() - lastClick.time < 500) return
                    controller.removeNotes([hit.note.id])
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
        PianoLayer {
            drawingKind: "scale"
            objectName: "pianoRollVelocityScale"
            visible: velocityLane.visible
            x: 0
            y: velocityLane.y
            width: root.keyboardWidth
            height: velocityLane.height

        }
        PianoLayer {
            drawingKind: "velocity"
            id: velocityLane
            objectName: "pianoRollVelocity"
            visible: root.drawVisible && root.laneInfo.type === "velocity"
            x: root.keyboardWidth
            y: gridArea.y + gridArea.height + root.laneBarHeight
            width: gridArea.width
            height: root.velocityHeight

            MouseArea {
                id: velocityMouse
                anchors.fill: parent
                property var gesture: null
                function velocityAt(y) { return Math.max(1, Math.min(127, Math.round(127 * (parent.height - y) / (parent.height - 2 * Ui.Metrics.xs)))) }
                function noteNear(x) {
                    return velocityLane.noteNear(x, Ui.Metrics.sm)
                }
                onPressed: mouse => {
                    root.forceActiveFocus()
                    root.laneFocused = false
                    const note = noteNear(mouse.x)
                    if (!note || !controller.editable) { mouse.accepted = !!note; return }
                    const ids = root.selectedSet[note.id] ? root.selectedIds : [note.id]
                    if (!root.selectedSet[note.id]) root.selectedIds = ids
                    if (!controller.beginNoteDrag(ids, "velocity")) return
                    gesture = {anchor: note.velocity}
                    controller.updateNoteDrag(velocityAt(mouse.y) - note.velocity, 0)
                }
                onPositionChanged: mouse => {
                    if (gesture) { controller.updateNoteDrag(velocityAt(mouse.y) - gesture.anchor, 0) }
                }
                onReleased: {
                    if (gesture) { controller.commitNoteDrag() }
                    gesture = null
                    controller.cancelTool()
                }
                onCanceled: { gesture = null; controller.cancelNoteDrag() }
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

        PianoLayer {
            drawingKind: "curve"
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
                    controller.cancelTool()
                    curveLane.requestPaint()
                }
                onDoubleClicked: mouse => {
                    if (!controller.editable) return
                    const hit = Lanes.hitPoint(root.lanePoints, mouse.x, mouse.y, curveLane.pixelOf, root.pointSize)
                    if (!hit) return
                    controller.cancelNoteDrag()
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

    // Explicit repaint requests cover tool previews. Native inputs invalidate themselves.
    function repaint() { grid.requestPaint(); repaintLane(); ruler.requestPaint(); keyboard.requestPaint() }
    Connections {
        target: controller
        function onNoteDragChanged() {
            if (!controller.noteDragActive) { root.cancelNotePreview() }

        }
    }
    onSelectedIdsChanged: {
        // Index ids of one note's curve mean nothing on another note.
        const edited = selectedIds.length === 1 ? selectedIds[0] : ""
        if (edited !== expressionNoteId) {
            expressionNoteId = edited
            if (laneInfo.type === "expression") selectedPointIds = []
        }
    }
    onControllersChanged: curveLane.requestPaint()

}

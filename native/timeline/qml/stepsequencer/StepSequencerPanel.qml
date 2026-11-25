// nt-panel: slot=bottom id=stepSequencer order=107 title="Step Sequencer"
// The Step Sequencer (web StepSequencer.tsx, Logic manual pages 724 to 760):
// the editor for one pattern region. It follows the selection like the piano
// roll: select a pattern region and the panel edits it. The layout is Logic's:
// a menu bar, a pattern bar, the Pattern Browser and the local inspector on the
// left, then the row headers and the step grid. Every edit runs one step
// pattern operation through the controller, so it is one undo entry and an
// agent can make the same edit with the tool of the same name.
// UI thread only.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "StepSequencerModes.js" as Modes

Rectangle {
    id: root
    objectName: "stepSequencerPanel"
    color: Ui.Theme.surfaceCanvas
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: parent && parent.parent ? parent.parent.height : Ui.Metrics.dialogWidth
    focus: true
    activeFocusOnTab: true

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
        followSelection()
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)

    property alias clipId: controller.clipId
    readonly property alias sequencer: controller
    readonly property var gestures: region ? region.gestures : null
    readonly property var clock: editor ? editor.clock : null
    readonly property var undoStack: controller.timeline ? controller.timeline.undoStack : null
    readonly property bool editable: controller.editable
    readonly property var rows: controller.rows
    readonly property var settings: controller.settings

    StepSequencerController {
        id: controller
        timeline: root.editor ? root.editor.timeline : null
        onPatternChanged: root.pruneSelection()
    }

    // ── View state. None of it is an undo entry (SQ46). ─────────────────────
    property string editMode: "onOff"
    property string lastValueMode: "velocity"
    onEditModeChanged: if (editMode !== "onOff") lastValueMode = editMode === "value" ? "velocity" : editMode
    property string selectedRowId: ""
    property var selectedSteps: []          // [{row, step}]
    property var expandedRows: ({})
    property bool inspectorVisible: true
    property bool browserVisible: false
    property bool linkOn: true
    property bool midiOut: true
    property bool rowColors: true
    property string displayValues: "selected"   // "editing" | "selected" | "all" (D100)
    property real rowZoom: 1
    property bool wideSteps: true
    property real scrollX: 0
    property string inspectorTab: "pattern"
    property var gesture: null
    property var previewMap: ({})
    property var playingSteps: ({})
    readonly property real rowHeight: Math.round(Ui.Metrics.xxxl * 1.75 * rowZoom)
    readonly property real headerWidth: Ui.Metrics.panelWidth * 0.86
    readonly property real sideWidth: Ui.Metrics.panelWidth * 0.82
    readonly property int maxLength: rows.reduce((m, r) => Math.max(m, r.lengthSteps), settings.lengthSteps || 16)
    readonly property real gridWidth: Math.max(1, grid.width - headerWidth)
    // Max: one page of 16 steps fills the grid. Min: the whole pattern fits.
    readonly property int visibleSteps: wideSteps ? Math.min(16, maxLength) : maxLength
    readonly property real cellWidth: Math.max(Ui.Metrics.lg, (gridWidth - (visibleSteps / 4) * Ui.Metrics.xs) / Math.max(1, visibleSteps))
    readonly property int page: Math.round(scrollX / Math.max(1, pageWidth()))
    function pageWidth() { return 16 * cellWidth + 4 * Ui.Metrics.xs }
    function stepX(i) { return i * cellWidth + Math.floor(i / 4) * Ui.Metrics.xs }
    function stepAt(x) {
        const local = x + scrollX
        const i = Math.floor(local / (cellWidth + Ui.Metrics.xs / 4))
        let best = Math.max(0, i - 1)
        for (let k = Math.max(0, i - 1); k <= i + 1; ++k) if (stepX(k) <= local) best = k
        return Math.max(0, Math.min(maxLength - 1, best))
    }
    function showPage(p) {
        const pages = Math.ceil(maxLength / 16)
        const next = Math.max(0, Math.min(pages - 1, p))
        scrollX = wideSteps ? next * pageWidth() : 0
    }
    onWideStepsChanged: scrollX = 0

    // ── Selection follows the tracks area (SQ27). ───────────────────────────
    function followSelection() {
        if (!gestures || !linkOn) return
        const selection = gestures.selection || []
        if (selection.length !== 1) return
        const clip = gestures.clipData(selection[0])
        if (clip && clip.mediaType === "midi" && clip.pattern && controller.clipId !== selection[0]) controller.clipId = selection[0]
    }
    Connections {
        target: root.gestures
        ignoreUnknownSignals: true
        function onSelectionChanged() { root.followSelection() }
    }
    Connections {
        target: root.clock
        ignoreUnknownSignals: true
        function onTimeChanged() { root.updatePlaying() }
    }
    function updatePlaying() {
        if (!clock || !clock.playing || !controller.valid) {
            if (Object.keys(playingSteps).length) playingSteps = ({})
            return
        }
        const next = {}
        const ms = clock.timeMs !== undefined ? clock.timeMs : clock.time
        for (const r of rows) next[r.id] = controller.playingStep(r.id, ms)
        playingSteps = next
    }
    function pruneSelection() {
        if (selectedRowId && !rows.some(r => r.id === selectedRowId)) selectedRowId = rows.length ? rows[0].id : ""
        if (!selectedRowId && rows.length) selectedRowId = rows[0].id
        selectedSteps = selectedSteps.filter(s => rows.some(r => r.id === s.row && s.step < r.lengthSteps))
    }

    // ── Writes ──────────────────────────────────────────────────────────────
    function op(name, args) {
        const result = controller.runOp(name, args || {})
        return result
    }
    function rowById(id) { return rows.find(r => r.id === id) || null }
    function selectRow(id) {
        selectedRowId = id
        if (inspectorTab === "step" && !selectedSteps.length) inspectorTab = "row"
    }
    function isStepSelected(rowId, step) { return selectedSteps.some(s => s.row === rowId && s.step === step) }
    function selectStep(rowId, step, additive) {
        const exists = isStepSelected(rowId, step)
        if (!additive) selectedSteps = [{row: rowId, step: step}]
        else selectedSteps = exists ? selectedSteps.filter(s => !(s.row === rowId && s.step === step)) : selectedSteps.concat([{row: rowId, step: step}])
        selectedRowId = rowId
        if (selectedSteps.length) inspectorTab = "step"
    }
    function previewFor(rowId, step) {
        const key = rowId + ":" + step
        return previewMap[key] || null
    }
    function nudge(rowId, mode, delta) {
        op("nudge_pattern_values", rowId ? {row: rowId, mode: mode, delta: delta} : {mode: mode, delta: delta})
    }
    function randomize(rowIds, mode) {
        const args = {mode: mode}
        if (rowIds && rowIds.length) args.rows = rowIds
        // Each click draws a new seed, so a second click gives a new result.
        args.seed = Math.floor(Math.random() * 4294967295)
        op("randomize_pattern", args)
    }
    function clearRow(rowId, mode) {
        const args = {scope: "row", row: rowId}
        if (mode) args.mode = mode
        op("clear_pattern", args)
    }
    function toggleSubrows(rowId, all) {
        const next = Object.assign({}, expandedRows)
        const open = !next[rowId]
        if (all) for (const r of rows) next[r.id] = open
        else next[rowId] = open
        expandedRows = next
    }
    function setSubrowMode(rowId, index, mode) {
        const row = rowById(rowId)
        if (!row) return
        const subrows = (row.subrows || []).slice()
        if (subrows.indexOf(mode) >= 0) return
        subrows[index] = mode
        op("set_pattern_row", {row: rowId, subrows: subrows})
    }
    function addSubrow(rowId) {
        const row = rowById(rowId)
        if (!row) return
        const subrows = (row.subrows || []).slice()
        const next = Modes.MODES.find(m => m.value !== "onOff" && subrows.indexOf(m.value) < 0 && Modes.supportsMode(row, m.value))
        if (!next) return
        subrows.push(next.value)
        op("set_pattern_row", {row: rowId, subrows: subrows})
        const open = Object.assign({}, expandedRows); open[rowId] = true; expandedRows = open
    }
    function deleteSubrow(rowId) {
        const row = rowById(rowId)
        if (!row || !(row.subrows || []).length) return
        op("set_pattern_row", {row: rowId, subrows: row.subrows.slice(0, -1)})
    }
    function renameRow(rowId) {
        const row = rowById(rowId)
        if (!row) return
        renameField.rowId = rowId
        renameField.value = row.label
        renameDialog.open()
    }

    // ── Gestures (SQ32, SQ33). One gesture is one write on release. ─────────
    function beginGesture(row, step, mode, fraction, mods) {
        if (!editable) return
        const cmd = (mods & Qt.ControlModifier) !== 0
        const alt = (mods & Qt.AltModifier) !== 0
        const shift = (mods & Qt.ShiftModifier) !== 0
        selectedRowId = row.id
        const spec = Modes.spec(mode)
        let kind = ""
        if (shift && !cmd && !alt && mode !== "loop") { selectStep(row.id, step, true); return }
        if (alt && !cmd) kind = "reset"
        else if (cmd && alt && spec.kind === "number") kind = "ramp"
        else if (cmd && spec.kind === "number") kind = "toggle"
        else if (cmd && ["tie", "stepRate", "loop"].indexOf(mode) < 0) kind = "tie"
        else if (mode === "loop") kind = "loop"
        else if (mode === "tie") kind = "tieEdge"
        else if (spec.kind === "bool") kind = "paint"
        else kind = "value"
        const current = Modes.value(row, step, mode)
        gesture = {kind: kind, row: row, mode: mode, start: step, end: step, steps: [step],
                   value: kind === "paint" ? (current ? 0 : 1) : Modes.fromFraction(row, mode, fraction),
                   from: Modes.fromFraction(row, mode, fraction), to: Modes.fromFraction(row, mode, fraction),
                   leaveOff: shift}
        if (!(selectedSteps.length && isStepSelected(row.id, step))) selectedSteps = [{row: row.id, step: step}]
        refreshPreview()
    }
    function moveGesture(step, fraction) {
        if (!gesture) return
        const g = Object.assign({}, gesture)
        g.end = step
        if (g.kind === "paint" || g.kind === "reset") {
            if (g.steps.indexOf(step) < 0) g.steps = g.steps.concat([step])
        } else if (g.kind === "value") {
            g.value = Modes.fromFraction(g.row, g.mode, fraction)
        } else if (g.kind === "ramp") {
            g.to = Modes.fromFraction(g.row, g.mode, fraction)
        }
        gesture = g
        refreshPreview()
    }
    function refreshPreview() {
        const g = gesture
        const map = {}
        if (g) {
            const field = Modes.spec(g.mode).field
            if (g.kind === "paint") for (const s of g.steps) { const p = {}; if (field === "on") p.on = !!g.value; map[g.row.id + ":" + s] = p }
            if (g.kind === "reset") for (const s of g.steps) map[g.row.id + ":" + s] = {on: false}
            if (g.kind === "value") map[g.row.id + ":" + g.start] = {value: g.value, on: true}
            if (g.kind === "ramp") {
                const span = Modes.span(g.start, g.end)
                span.forEach((s, k) => { map[g.row.id + ":" + s] = {value: Math.round(g.from + (g.to - g.from) * (span.length > 1 ? k / (span.length - 1) : 0))} })
            }
        }
        previewMap = map
    }
    function endGesture() {
        const g = gesture
        gesture = null
        previewMap = ({})
        if (!g) return
        const id = g.row.id
        const field = Modes.spec(g.mode).field
        if (g.kind === "paint") {
            const values = {}
            values[field] = !!g.value
            op("set_steps", {row: id, steps: Modes.oneBased(g.steps), values: values})
        } else if (g.kind === "reset") {
            op("clear_pattern", {scope: "steps", row: id, steps: Modes.oneBased(g.steps)})
        } else if (g.kind === "toggle") {
            op("set_steps", {row: id, steps: String(g.start + 1), values: {on: !Modes.value(g.row, g.start, "onOff")}})
        } else if (g.kind === "value") {
            const targets = selectedSteps.filter(s => s.row === id).map(s => s.step)
            if (targets.length > 1 && targets.indexOf(g.start) >= 0) {
                // Several selected steps move by one shared delta, limited to the range (p. 736).
                const delta = g.value - Modes.value(g.row, g.start, g.mode)
                const r = Modes.range(g.row, g.mode)
                const vals = targets.map(s => Modes.value(g.row, s, g.mode))
                const limited = Math.max(r.min - Math.min.apply(null, vals), Math.min(r.max - Math.max.apply(null, vals), delta))
                if (limited !== 0) op("nudge_pattern_values", {row: id, steps: Modes.oneBased(targets), mode: g.mode, delta: limited})
            } else {
                op("set_steps", {row: id, steps: String(g.start + 1), values: Modes.patch(g.mode, g.value)})
            }
        } else if (g.kind === "ramp") {
            const span = Modes.span(g.start, g.end)
            op("set_steps", {row: id, steps: Modes.oneBased(span), ramp: {field: field, from: g.from, to: g.to, leaveOff: g.leaveOff}})
        } else if (g.kind === "tie") {
            if (g.start !== g.end) op("tie_steps", {row: id, from: Math.min(g.start, g.end) + 1, to: Math.max(g.start, g.end) + 1, tie: true})
        } else if (g.kind === "tieEdge") {
            const span = Modes.tieSpanAt(g.row, g.start)
            if (g.end > span.end) op("tie_steps", {row: id, from: span.start + 1, to: g.end + 1, tie: true})
            else if (g.end < g.start) op("tie_steps", {row: id, from: g.end + 2, to: span.end + 1, tie: false})
            else if (g.start > span.start && g.start <= span.end) op("tie_steps", {row: id, from: g.start + 1, to: span.end + 1, tie: false})
            else op("set_steps", {row: id, steps: String(g.start + 1), values: {on: !Modes.value(g.row, g.start, "onOff")}})
        } else if (g.kind === "loop") {
            op("set_pattern_row", {row: id, loopStart: Math.min(g.start, g.end) + 1, loopEnd: Math.max(g.start, g.end) + 1})
        }
    }
    function cancelGesture() { gesture = null; previewMap = ({}) }

    // ── Commands (SQ35). Each runs from a menu entry and a key. ─────────────
    function selectionArgs() {
        const steps = selectedSteps.filter(s => s.row === selectedRowId).map(s => s.step)
        return steps.length ? {row: selectedRowId, steps: Modes.oneBased(steps)} : null
    }
    function runAction(id) {
        const mode = Modes.effectiveMode(rowById(selectedRowId) || {type: ""}, editMode)
        switch (id) {
        case "undo": if (undoStack && undoStack.canUndo) undoStack.undo(); return true
        case "redo": if (undoStack && undoStack.canRedo) undoStack.redo(); return true
        case "clearStep": { const a = selectionArgs(); if (a) op("clear_pattern", Object.assign({scope: "steps"}, a)); return true }
        case "clearRow": if (selectedRowId) clearRow(selectedRowId, ""); return true
        case "clearRowMode": if (selectedRowId) clearRow(selectedRowId, mode); return true
        case "clearPattern": op("clear_pattern", {scope: "pattern"}); return true
        case "clearPatternMode": op("clear_pattern", {scope: "pattern", mode: mode}); return true
        case "deleteRow": if (selectedRowId) op("remove_pattern_rows", {rows: [selectedRowId]}); return true
        case "deleteUnused": op("remove_pattern_rows", {unused: true}); return true
        case "muteRow": { const r = rowById(selectedRowId); if (r) op("set_pattern_row", {row: r.id, mute: !r.mute}); return true }
        case "soloRow": { const r = rowById(selectedRowId); if (r) op("set_pattern_row", {row: r.id, solo: !r.solo}); return true }
        case "renameRow": renameRow(selectedRowId); return true
        case "rotatePatternLeft": op("rotate_pattern", {by: -1}); return true
        case "rotatePatternRight": op("rotate_pattern", {by: 1}); return true
        case "rotateRowLeft": if (selectedRowId) op("rotate_pattern", {row: selectedRowId, by: -1}); return true
        case "rotateRowRight": if (selectedRowId) op("rotate_pattern", {row: selectedRowId, by: 1}); return true
        case "rotateModeLeft": if (selectedRowId) op("rotate_pattern", {row: selectedRowId, by: -1, mode: mode}); return true
        case "rotateModeRight": if (selectedRowId) op("rotate_pattern", {row: selectedRowId, by: 1, mode: mode}); return true
        case "incrementPattern": nudge("", mode, 1); return true
        case "decrementPattern": nudge("", mode, -1); return true
        case "randomizeRows": randomize(selectedRowId ? [selectedRowId] : [], mode); return true
        case "randomizeAll": randomize([], mode); return true
        case "randomizeSteps": { const a = selectionArgs(); if (a) op("randomize_pattern", {mode: mode, rows: [a.row], steps: a.steps, seed: Math.floor(Math.random() * 4294967295)}); return true }
        case "toggleStep": {
            const a = selectionArgs()
            const r = rowById(selectedRowId)
            if (a && r) op("set_steps", {row: r.id, steps: a.steps, values: {on: !Modes.value(r, selectedSteps.find(s => s.row === r.id).step, "onOff")}})
            return true
        }
        case "mono": op("set_pattern", {mono: !settings.mono}); return true
        case "newSeed": op("set_pattern_seed", {}); return true
        case "addSubrow": if (selectedRowId) addSubrow(selectedRowId); return true
        case "deleteSubrow": if (selectedRowId) deleteSubrow(selectedRowId); return true
        case "showSubrows": if (selectedRowId) toggleSubrows(selectedRowId, false); return true
        case "showAllSubrows": toggleSubrows(selectedRowId || (rows[0] && rows[0].id), true); return true
        case "inspector": inspectorVisible = !inspectorVisible; return true
        case "browser": browserVisible = !browserVisible; return true
        case "rowColors": rowColors = !rowColors; return true
        case "valuesEditing": displayValues = "editing"; return true
        case "valuesSelected": displayValues = "selected"; return true
        case "valuesAll": displayValues = "all"; return true
        case "link": linkOn = !linkOn; followSelection(); return true
        case "nextPage": showPage(page + 1 >= Math.ceil(maxLength / 16) ? 0 : page + 1); return true
        case "nextMode": cycleMode(1); return true
        case "previousMode": cycleMode(-1); return true
        case "convertToMidi": op("convert_pattern_to_midi", {clipIds: [controller.clipId]}); return true
        case "convertToPattern": op("convert_midi_to_pattern", {clipIds: [controller.clipId]}); return true
        }
        if (id.indexOf("sort:") === 0) { op("sort_pattern_rows", {by: id.slice(5)}); return true }
        if (id.indexOf("addRow:") === 0) { addRow(id.slice(7)); return true }
        return false
    }
    function cycleMode(delta) {
        const list = Modes.MODES.map(m => m.value)
        const i = list.indexOf(editMode === "value" ? "velocity" : editMode)
        editMode = list[(i + delta + list.length) % list.length]
    }
    function addRow(spec) {
        // spec: "note:38", "cc:74", "pitchBend", "channelPressure"
        const parts = spec.split(":")
        let row = null
        if (parts[0] === "note") row = {assignment: {type: "note", pitch: Number(parts[1])}}
        else if (parts[0] === "melodic") row = {assignment: {type: "melodic", pitch: Number(parts[1])}}
        else if (parts[0] === "cc") row = {assignment: {type: "automation", target: {kind: "cc", cc: Number(parts[1])}}}
        else if (parts[0] === "pitchBend" || parts[0] === "channelPressure") row = {assignment: {type: "automation", target: {kind: parts[0]}}}
        if (row) op("add_pattern_rows", {rows: [row]})
    }

    // Keys (SQ34, SQ35). Command is Ctrl in Qt on macOS, Control is Meta.
    Keys.onPressed: event => {
        const cmd = (event.modifiers & Qt.ControlModifier) !== 0
        const alt = (event.modifiers & Qt.AltModifier) !== 0
        const shift = (event.modifiers & Qt.ShiftModifier) !== 0
        const ctl = (event.modifiers & Qt.MetaModifier) !== 0
        const plain = !cmd && !alt && !ctl
        let action = ""
        if (plain && !shift && event.text.length === 1) {
            const m = Modes.modeForKey(event.text.toLowerCase())
            if (m) { editMode = m; event.accepted = true; return }
            if (event.text === "'") action = "toggleStep"
        }
        if (ctl && alt && !cmd && event.key === Qt.Key_S) { editMode = "onOff"; event.accepted = true; return }
        if (alt && event.key === Qt.Key_PageDown) action = "nextMode"
        else if (alt && event.key === Qt.Key_PageUp) action = "previousMode"
        else if (cmd && alt && ctl && event.key === Qt.Key_Left) action = "rotatePatternLeft"
        else if (cmd && alt && ctl && event.key === Qt.Key_Right) action = "rotatePatternRight"
        else if (cmd && alt && event.key === Qt.Key_Left) action = "rotateRowLeft"
        else if (cmd && alt && event.key === Qt.Key_Right) action = "rotateRowRight"
        else if (alt && shift && event.key === Qt.Key_Left) action = "rotateModeLeft"
        else if (alt && shift && event.key === Qt.Key_Right) action = "rotateModeRight"
        else if (ctl && cmd && event.key === Qt.Key_Right) action = "showSubrows"
        else if (ctl && cmd && event.key === Qt.Key_Left) action = "showSubrows"
        else if (ctl && shift && cmd && (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete)) action = "clearPattern"
        else if (ctl && cmd && (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete)) action = "clearRow"
        else if (alt && shift && cmd && (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete)) action = "clearPatternMode"
        else if (alt && cmd && (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete)) action = "clearRowMode"
        else if (shift && cmd && (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete)) action = "deleteUnused"
        else if (cmd && (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete)) action = "deleteRow"
        else if (ctl && (event.key === Qt.Key_Backspace || event.key === Qt.Key_Delete)) action = "clearStep"
        else if (ctl && shift && event.key === Qt.Key_M && cmd) action = "mono"
        else if (ctl && shift && event.key === Qt.Key_M) action = "muteRow"
        else if (ctl && shift && event.key === Qt.Key_S) action = "soloRow"
        else if (shift && (event.key === Qt.Key_Return || event.key === Qt.Key_Enter)) action = "renameRow"
        else if (alt && shift && cmd && event.key === Qt.Key_R) action = "randomizeSteps"
        else if (alt && cmd && event.key === Qt.Key_R) action = "randomizeAll"
        else if (shift && cmd && event.key === Qt.Key_R) action = "randomizeRows"
        else if (alt && shift && event.key === Qt.Key_B) action = "browser"
        else if (alt && event.key === Qt.Key_QuoteLeft) action = "nextPage"
        else if (plain && (event.key === Qt.Key_Left || event.key === Qt.Key_Right)) {
            moveSelection(event.key === Qt.Key_Left ? -1 : 1, shift)
            event.accepted = true
            return
        } else if (plain && !shift && (event.key === Qt.Key_Up || event.key === Qt.Key_Down)) {
            const i = rows.findIndex(r => r.id === selectedRowId)
            const next = rows[Math.max(0, Math.min(rows.length - 1, i + (event.key === Qt.Key_Up ? -1 : 1)))]
            if (next) selectRow(next.id)
            event.accepted = true
            return
        }
        if (action) { runAction(action); event.accepted = true }
    }
    function moveSelection(delta, extend) {
        const row = rowById(selectedRowId)
        if (!row) return
        const own = selectedSteps.filter(s => s.row === row.id).map(s => s.step)
        const anchor = own.length ? (delta > 0 ? Math.max.apply(null, own) : Math.min.apply(null, own)) : -delta
        const next = Math.max(0, Math.min(row.lengthSteps - 1, anchor + delta))
        selectedSteps = extend ? own.concat([next]).filter((v, i, a) => a.indexOf(v) === i).map(s => ({row: row.id, step: s})) : [{row: row.id, step: next}]
    }

    // ── Layout ──────────────────────────────────────────────────────────────
    StepSequencerToolbar {
        id: menuBar
        objectName: "stepSequencerMenuBar"
        panel: root
        width: parent.width
        height: Ui.Metrics.standard + Ui.Metrics.xs
    }
    StepSequencerPatternBar {
        id: patternBar
        objectName: "stepSequencerPatternBar"
        panel: root
        y: menuBar.height
        width: parent.width
        height: Ui.Metrics.standard
    }
    Item {
        id: body
        y: patternBar.y + patternBar.height
        width: parent.width
        height: parent.height - y
        StepSequencerBrowser {
            id: browser
            objectName: "stepSequencerBrowser"
            panel: root
            visible: root.browserVisible
            width: visible ? root.sideWidth : 0
            height: parent.height
        }
        StepSequencerInspector {
            id: inspector
            objectName: "stepSequencerInspector"
            panel: root
            x: browser.width
            visible: root.inspectorVisible && controller.valid
            width: visible ? root.sideWidth : 0
            height: parent.height
        }
        Rectangle {
            x: browser.width + inspector.width
            width: Ui.Metrics.border
            height: parent.height
            color: Ui.Theme.borderSubtle
            visible: x > 0
        }
        ListView {
            id: grid
            objectName: "stepSequencerGrid"
            x: browser.width + inspector.width + Ui.Metrics.border
            width: parent.width - x
            height: parent.height
            clip: true
            visible: controller.valid
            model: controller.rows
            reuseItems: true
            boundsBehavior: Flickable.StopAtBounds
            delegate: StepSequencerRow {
                required property var modelData
                panel: root
                row: modelData
            }
            WheelHandler {
                acceptedModifiers: Qt.ShiftModifier
                onWheel: event => {
                    const max = Math.max(0, root.stepX(root.maxLength) - root.gridWidth)
                    root.scrollX = Math.max(0, Math.min(max, root.scrollX - event.angleDelta.y))
                }
            }
        }
        Ui.EmptyState {
            anchors.centerIn: grid
            width: Math.min(grid.width - Ui.Metrics.xxl, Ui.Metrics.dialogCompactWidth)
            visible: !controller.valid
            title: controller.convertible ? qsTr("This MIDI region has no pattern") : qsTr("No pattern region selected")
            message: controller.convertible
                ? qsTr("Convert it to a pattern region to edit it in the Step Sequencer.")
                : qsTr("Select a pattern region in the tracks area, or load a pattern from the Pattern Browser.")
            actionText: controller.convertible ? qsTr("Convert to Pattern Region") : ""
            onActionTriggered: root.runAction("convertToPattern")
        }
    }
    Ui.Banner {
        anchors.bottom: parent.bottom
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottomMargin: Ui.Metrics.md
        width: Math.min(parent.width - Ui.Metrics.xl, Ui.Metrics.dialogWidth)
        visible: controller.lastError !== ""
        status: Ui.Status.Error
        message: controller.lastError
    }

    Ui.ContextMenu {
        id: rowMenu
        property string rowId: ""
        entries: [
            {id: "renameRow", label: qsTr("Rename Row"), shortcut: "⇧↩"},
            {id: "muteRow", label: qsTr("Mute Row")},
            {id: "soloRow", label: qsTr("Solo Row")},
            {separator: true},
            {id: "addSubrow", label: qsTr("Add Subrow")},
            {id: "deleteSubrow", label: qsTr("Delete Subrow")},
            {separator: true},
            {id: "clearRow", label: qsTr("Clear Row")},
            {id: "clearRowMode", label: qsTr("Clear Current Mode for Row")},
            {id: "deleteRow", label: qsTr("Delete Row")}
        ]
        onEntryTriggered: id => root.runAction(id)
    }
    function openRowMenu(rowId, item, x, y) { selectedRowId = rowId; rowMenu.popupAt(item, x, y) }
    Ui.ContextMenu {
        id: stepMenu
        entries: [
            {id: "toggleStep", label: qsTr("Toggle Step")},
            {id: "clearStep", label: qsTr("Clear Step")},
            {id: "randomizeSteps", label: qsTr("Randomize Selected Steps")}
        ]
        onEntryTriggered: id => root.runAction(id)
    }
    function openStepMenu(rowId, step, item, x, y) {
        if (!isStepSelected(rowId, step)) selectStep(rowId, step, false)
        stepMenu.popupAt(item, x, y)
    }
    Ui.Dialog {
        id: renameDialog
        title: qsTr("Rename Row")
        returnFocusTo: root
        width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width : Ui.Metrics.dialogCompactWidth)
        onOpened: renameField.forceActiveFocus(Qt.PopupFocusReason)
        Ui.TextField {
            id: renameField
            property string rowId: ""
            width: parent ? parent.width : Ui.Metrics.panelWidth
            accessibleName: qsTr("Row Name")
            onValueCommitted: next => {
                root.op("set_pattern_row", {row: renameField.rowId, name: next})
                renameDialog.close()
            }
        }
    }
}

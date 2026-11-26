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
    onSelectedRowIdChanged: if (!selectedRowId && controller.learnMode === "assign") controller.learnMode = ""
    property var selectedSteps: []          // [{row, step}]
    property int keyModifiers: Qt.NoModifier
    property var clipboard: null            // {kind: "steps"|"row", clipId, row, steps, cut}
    property var rowDrag: null              // {id, from, target}
    property bool inspectorVisible: true
    property bool browserVisible: false
    property bool browserLoaded: false
    onBrowserVisibleChanged: {
        if (browserVisible) {
            controller.ensureLibraryLoaded()
            browserLoaded = true
        }
    }
    property bool linkOn: true
    property bool rowColors: true
    property string displayValues: "selected"   // "editing" | "selected" | "all" (D100)
    property real rowZoom: 1
    property bool wideSteps: true
    property real scrollX: 0
    property string inspectorTab: "pattern"
    property var gesture: null
    property var previewMap: ({})
    readonly property real rowHeight: Math.round(Ui.Metrics.xxxl * 1.75 * rowZoom)
    readonly property real headerWidth: Ui.Metrics.panelWidth * 0.86
    readonly property real sideWidth: Ui.Metrics.panelWidth * 0.82
    readonly property int maxLength: rows.reduce((m, r) => Math.max(m, r.lengthSteps), settings.lengthSteps || 16)
    readonly property real gridWidth: Math.max(1, grid.width - headerWidth)
    // Max: one page of 16 steps fills the grid. Min: the whole pattern fits.
    readonly property int visibleSteps: wideSteps ? Math.min(16, maxLength) : maxLength
    readonly property real cellWidth: Math.max(Ui.Metrics.lg, (gridWidth - (visibleSteps / 4) * Ui.Metrics.xs) / Math.max(1, visibleSteps))
    readonly property int page: Math.round(scrollX / Math.max(1, pageWidth()))
    // The steps in view: rows build cells only for these (PERFORMANCE.md rule 3).
    readonly property int firstStep: Math.max(0, rawStepAt(scrollX) - 1)
    readonly property int stepWindow: visibleSteps + 3
    function pageWidth() { return 16 * cellWidth + 4 * Ui.Metrics.xs }
    function stepX(i) { return i * cellWidth + Math.floor(i / 4) * Ui.Metrics.xs }
    function rawStepAt(local) {
        const i = Math.floor(local / (cellWidth + Ui.Metrics.xs / 4))
        let best = Math.max(0, i - 1)
        for (let k = Math.max(0, i - 1); k <= i + 1; ++k) if (stepX(k) <= local) best = k
        return best
    }
    // The step under lane x. With `rowLength` > 0, -1 past that row's last step
    // (a shorter polymetric row, SQ7).
    function stepAt(x, rowLength) {
        const best = rawStepAt(x + scrollX)
        if (rowLength > 0) return best < rowLength ? best : -1
        return Math.max(0, Math.min(maxLength - 1, best))
    }
    function showPage(p) {
        const pages = Math.ceil(maxLength / 16)
        const next = Math.max(0, Math.min(pages - 1, p))
        scrollX = wideSteps ? next * pageWidth() : 0
    }
    onWideStepsChanged: scrollX = 0

    // ── Selection follows the tracks area (SQ27). ───────────────────────────
    // A 1-bar empty pattern region at the playhead, on the track of the selected
    // clip when it is a MIDI track, else on the first MIDI track. Then select it.
    function newPatternRegion() {
        const selection = gestures ? (gestures.selection || []) : []
        const selected = selection.length > 0 ? gestures.clipData(selection[0]) : null
        const trackId = selected && selected.mediaType === "midi" ? selected.trackId : ""
        const ms = clock ? (clock.timeMs !== undefined ? clock.timeMs : clock.time) : 0
        const result = controller.createPatternRegion(trackId || "", ms)
        if (result.ok && gestures) gestures.selection = [result.clip.id]
        return result
    }
    function followSelection() {
        if (!gestures || !linkOn) return
        const selection = gestures.selection || []
        if (selection.length !== 1) return
        const clip = gestures.clipData(selection[0])
        // A plain MIDI region reaches the controller too, so the panel offers Convert.
        if (clip && clip.mediaType === "midi" && controller.clipId !== selection[0]) controller.clipId = selection[0]
    }
    Connections {
        target: root.gestures
        ignoreUnknownSignals: true
        function onSelectionChanged() { root.followSelection() }
    }
    // The playhead highlight runs in C++ against cached step spans: one binary
    // search per row, and a role change only for rows whose step moved (SQ17).
    function updatePlaying() {
        const ms = clock ? (clock.timeMs !== undefined ? clock.timeMs : clock.time) : -1
        controller.playheadMs = clock && clock.playing && controller.valid ? ms : -1
    }
    Connections {
        target: root.clock
        ignoreUnknownSignals: true
        function onTimeChanged() { root.updatePlaying() }
        function onPlayingChanged() { root.updatePlaying() }
    }
    function pruneSelection() {
        if (selectedRowId && !rows.some(r => r.id === selectedRowId)) selectedRowId = rows.length ? rows[0].id : ""
        if (!selectedRowId && rows.length) selectedRowId = rows[0].id
        const remaining = selectedSteps.filter(s => rows.some(r => r.id === s.row && s.step < r.lengthSteps))
        if (remaining.length !== selectedSteps.length) {
            selectedSteps = remaining
        }
    }

    // ── Writes ──────────────────────────────────────────────────────────────
    function op(name, args) {
        const result = controller.runOp(name, args || {})
        return result
    }
    // Several ops as one undo entry.
    function ops(list) { return controller.runOps(list) }
    // Relative change of `mode` on `steps` of `row`: each step moves by `delta`
    // from its own value (SQ31, SQ33). One undo entry.
    function shiftSteps(row, steps, mode, delta) {
        const list = steps.map(s => ({op: "set_steps", args: {row: row.id, steps: String(s + 1),
                                                         values: Modes.patch(mode, Modes.value(row, s, mode) + delta)}}))
        if (list.length) ops(list)
    }
    function rowById(id) { return rows.find(r => r.id === id) || null }
    function selectRow(id) {
        selectedRowId = id
        if (inspectorTab === "step" && !selectedSteps.length) inspectorTab = "row"
    }
    readonly property var selectedStepKeys: {
        const keys = Object.create(null)
        for (const s of selectedSteps) keys[s.row + ":" + s.step] = true
        return keys
    }
    function isStepSelected(rowId, step) { return selectedStepKeys[rowId + ":" + step] === true }
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
    // Subrow expansion is document data (SQ8): `subrowsExpanded` on the row.
    function setSubrowsShown(rowId, shown, all) {
        const targets = all ? rows : rows.filter(r => r.id === rowId)
        const list = targets.filter(r => (r.subrowsExpanded === true) !== shown)
                            .map(r => ({op: "set_pattern_row", args: {row: r.id, subrowsExpanded: shown}}))
        if (list.length) ops(list)
    }
    function toggleSubrows(rowId, all) {
        const row = rowById(rowId)
        if (row) setSubrowsShown(rowId, row.subrowsExpanded !== true, all)
    }
    // Row header drag (SQ29): the target index follows the pointer, a release moves the row.
    function dragRow(rowId, from, y) {
        let target = 0
        let top = 0
        for (let i = 0; i < rows.length; ++i) {
            const h = rowHeight + (rows[i].subrowsExpanded ? (rows[i].subrows || []).length * Math.round(rowHeight * 0.7) : 0)
            if (y > top + h / 2) target = i + 1
            top += h
        }
        rowDrag = {id: rowId, from: from, target: Math.min(rows.length, target)}
    }
    function dropRow() {
        const d = rowDrag
        rowDrag = null
        if (!d) return
        const to = d.target > d.from ? d.target - 1 : d.target
        if (to !== d.from) op("move_pattern_row", {row: d.id, toIndex: to})
    }
    function cancelRowDrag() { rowDrag = null }
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
        op("set_pattern_row", {row: rowId, subrows: subrows, subrowsExpanded: true})
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
        // Option-Command: click unties a tied step, drag ramps (SQ33).
        else if (cmd && alt) kind = "cmdAlt"
        // Command: drag ties (not in Tie, Step Rate, Loop), click toggles in value modes.
        else if (cmd) kind = "cmd"
        else if (mode === "loop") kind = "loop"
        else if (mode === "tie") kind = "tieEdge"
        else if (spec.kind === "bool") kind = "paint"
        else kind = "value"
        const current = Modes.value(row, step, mode)
        const v = Modes.fromFraction(row, mode, fraction)
        gesture = {kind: kind, row: row, mode: mode, start: step, end: step, steps: [step],
                   value: kind === "paint" ? (current ? 0 : 1) : v, from: v, to: v, leaveOff: shift}
        if (!(selectedSteps.length && isStepSelected(row.id, step))) selectedSteps = [{row: row.id, step: step}]
        refreshPreview()
    }
    function moveGesture(step, fraction) {
        if (!gesture) return
        const g = Object.assign({}, gesture)
        if (g.kind === "paint" || g.kind === "reset") {
            // A fast drag skips pointer events: fill every step since the last one.
            const add = Modes.span(g.end, step).filter(s => g.steps.indexOf(s) < 0)
            if (add.length) g.steps = g.steps.concat(add)
        } else if (g.kind === "value") {
            g.value = Modes.fromFraction(g.row, g.mode, fraction)
        } else if (g.kind === "cmdAlt") {
            g.to = Modes.fromFraction(g.row, g.mode, fraction)
        }
        g.end = step
        gesture = g
        refreshPreview()
    }
    // Ramp values over steps in the drag direction: the first step dragged gets `from`.
    function rampValues(g) {
        const span = Modes.span(g.start, g.end)
        const n = span.length
        return span.map((s, k) => {
            const t = n > 1 ? (g.start <= g.end ? k : n - 1 - k) / (n - 1) : 0
            const v = g.from + (g.to - g.from) * t
            // Device parameters are 0..1 and keep fractions, like fromFraction.
            return {step: s, value: Modes.isDeviceValue(g.row, g.mode) ? Math.round(v * 1000) / 1000 : Math.round(v)}
        })
    }
    function isRamp(g) { return g.kind === "cmdAlt" && Modes.spec(g.mode).kind === "number" && g.start !== g.end }
    function refreshPreview() {
        const g = gesture
        const map = {}
        if (g) {
            const field = Modes.spec(g.mode).field
            if (g.kind === "paint") for (const s of g.steps) { const p = {}; if (field === "on") p.on = !!g.value; map[g.row.id + ":" + s] = p }
            if (g.kind === "reset") for (const s of g.steps) map[g.row.id + ":" + s] = {on: false}
            if (g.kind === "value") map[g.row.id + ":" + g.start] = {value: g.value, on: true}
            if (isRamp(g)) for (const r of rampValues(g)) map[g.row.id + ":" + r.step] = {value: r.value}
        }
        previewMap = map
    }
    function endGesture() {
        const g = gesture
        gesture = null
        previewMap = ({})
        if (!g) return
        const id = g.row.id
        const spec = Modes.spec(g.mode)
        const field = spec.field
        const lo = Math.min(g.start, g.end)
        const hi = Math.max(g.start, g.end)
        const tied = Modes.tieSpanAt(g.row, g.start)
        if (g.kind === "paint") {
            const values = {}
            values[field] = !!g.value
            op("set_steps", {row: id, steps: Modes.oneBased(g.steps), values: values})
        } else if (g.kind === "reset") {
            op("clear_pattern", {scope: "steps", row: id, steps: Modes.oneBased(g.steps)})
        } else if (g.kind === "cmd") {
            if (g.start !== g.end && ["tie", "stepRate", "loop"].indexOf(g.mode) < 0) op("tie_steps", {row: id, from: lo + 1, to: hi + 1, tie: true})
            else if (g.start === g.end && spec.kind === "number") op("set_steps", {row: id, steps: String(g.start + 1), values: {on: !Modes.value(g.row, g.start, "onOff")}})
        } else if (g.kind === "cmdAlt") {
            if (isRamp(g)) {
                // One field ramp in drag order. Option-Command-Shift leaves the steps off.
                const list = rampValues(g).map(r => {
                    const values = Modes.patch(g.mode, r.value)
                    if (g.leaveOff) values.on = !!(g.row.steps[r.step] || {}).on
                    return {op: "set_steps", args: {row: id, steps: String(r.step + 1), values: values}}
                })
                ops(list)
            } else if (g.start === g.end && tied.end > tied.start) {
                // Remove the tie at this step (p. 1197).
                const at = g.start === tied.start ? g.start + 2 : g.start + 1
                op("tie_steps", {row: id, from: at, to: at, tie: false})
            }
        } else if (g.kind === "value") {
            const targets = selectedSteps.filter(s => s.row === id).map(s => s.step)
            if (targets.length > 1 && targets.indexOf(g.start) >= 0) {
                // Several selected steps move by one shared delta, limited to the range (p. 736).
                const delta = g.value - Modes.value(g.row, g.start, g.mode)
                const r = Modes.range(g.row, g.mode)
                const vals = targets.map(s => Modes.value(g.row, s, g.mode))
                const limited = Math.max(r.min - Math.min.apply(null, vals), Math.min(r.max - Math.max.apply(null, vals), delta))
                if (limited !== 0) shiftSteps(g.row, targets, g.mode, limited)
            } else {
                op("set_steps", {row: id, steps: String(g.start + 1), values: Modes.patch(g.mode, g.value)})
            }
        } else if (g.kind === "tieEdge") {
            const span = tied
            if (g.end > span.end) op("tie_steps", {row: id, from: span.start + 1, to: g.end + 1, tie: true})
            else if (g.end < g.start) op("tie_steps", {row: id, from: g.end + 2, to: span.end + 1, tie: false})
            // A click in the middle of a tied cell shortens the tie to that step (SQ33).
            else if (span.end > span.start && g.start >= span.start && g.start < span.end) op("tie_steps", {row: id, from: g.start + 2, to: span.end + 1, tie: false})
            // A click elsewhere toggles the tie flag (SQ32).
            else op("set_steps", {row: id, steps: String(g.start + 1), values: {tie: !Modes.value(g.row, g.start, "tie")}})
        } else if (g.kind === "loop") {
            op("set_pattern_row", {row: id, loopStart: lo + 1, loopEnd: hi + 1})
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
        case "expandRow": if (selectedRowId) setSubrowsShown(selectedRowId, true, false); return true
        case "collapseRow": if (selectedRowId) setSubrowsShown(selectedRowId, false, false); return true
        case "expandAll": setSubrowsShown("", true, true); return true
        case "collapseAll": setSubrowsShown("", false, true); return true
        // Steps clipboard (SQ35): Cut clears the source when it is pasted.
        case "copySteps": case "cutSteps": {
            const a = selectionArgs()
            if (a) clipboard = {kind: "steps", clipId: controller.clipId, row: a.row, steps: a.steps, cut: id === "cutSteps",
                                first: Math.min.apply(null, selectedSteps.filter(s => s.row === a.row).map(s => s.step))}
            return true
        }
        case "pasteSteps": {
            const target = selectedSteps.find(s => s.row === selectedRowId)
            if (!clipboard || clipboard.kind !== "steps" || !selectedRowId) return true
            const args = {clipId: clipboard.clipId, row: clipboard.row, steps: clipboard.steps, toRow: selectedRowId,
                          toStep: (target ? target.step : clipboard.first) + 1}
            if (clipboard.clipId !== controller.clipId) args.toClipId = controller.clipId
            if (clipboard.cut) args.cut = true
            if (op("copy_steps", args).ok && clipboard.cut) clipboard = Object.assign({}, clipboard, {cut: false})
            return true
        }
        case "repeatStep": {
            const s = selectedSteps.find(x => x.row === selectedRowId)
            if (s) op("repeat_step", {row: s.row, step: s.step + 1})
            return true
        }
        case "copyRow": if (selectedRowId) clipboard = {kind: "row", clipId: controller.clipId, row: selectedRowId}; return true
        case "pasteRow": case "pasteNewRow": case "pasteRowSettings": {
            if (!clipboard || clipboard.kind !== "row") return true
            const args = {clipId: clipboard.clipId, row: clipboard.row}
            if (clipboard.clipId !== controller.clipId) args.toClipId = controller.clipId
            if (id === "pasteNewRow") args.asNew = true
            else if (selectedRowId) args.toRow = selectedRowId
            if (id === "pasteRowSettings") args.settingsOnly = true
            op("copy_pattern_row", args)
            return true
        }
        case "duplicateRowNext": if (selectedRowId) op("copy_pattern_row", {row: selectedRowId, nextAssignment: true}); return true
        case "transposeUp": transpose(1); return true
        case "transposeDown": transpose(-1); return true
        case "transposeOctaveUp": transpose(12); return true
        case "transposeOctaveDown": transpose(-12); return true
        case "patternRateUp": op("set_pattern", {stepRate: nudgedRate(settings.stepRate, 1)}); return true
        case "patternRateDown": op("set_pattern", {stepRate: nudgedRate(settings.stepRate, -1)}); return true
        case "rowRateUp": case "rowRateDown": { const r = rowById(selectedRowId); if (r) op("set_pattern_row", {row: r.id, stepRate: nudgedRate(r.stepRate, id === "rowRateUp" ? 1 : -1)}); return true }
        case "loopStartUp": case "loopStartDown": { const r = rowById(selectedRowId); if (r) op("set_pattern_row", {row: r.id, loopStart: Math.max(1, Math.min(r.loopEnd - 1, r.loopStart + 1 + (id === "loopStartUp" ? 1 : -1)))}); return true }
        case "loopEndUp": if (selectedRowId) op("nudge_pattern_values", {row: selectedRowId, mode: "loop", delta: 1}); return true
        case "loopEndDown": if (selectedRowId) op("nudge_pattern_values", {row: selectedRowId, mode: "loop", delta: -1}); return true
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
        case "learnAdd": if (editable) controller.learnMode = "add"; return true
        case "learnAssign": if (editable && selectedRowId) controller.learnMode = "assign"; return true
        case "learnOff": controller.learnMode = ""; return true
        case "stepRecord": if (editable) controller.stepRecording = !controller.stepRecording; return true
        case "savePattern": case "saveTemplate": {
            const kind = id === "saveTemplate" ? "template" : "pattern"
            if (!editable) return true
            saveDialog.patternKind = kind
            saveField.value = String(settings.name || "").trim() || controller.clipName.trim() || qsTr("Pattern")
            saveDialog.open()
            return true
        }
        case "convertToMidi": op("convert_pattern_to_midi", {clipIds: [controller.clipId]}); return true
        case "convertToPattern": op("convert_midi_to_pattern", {clipIds: [controller.clipId]}); return true
        case "newPatternRegion": newPatternRegion(); return true
        }
        // View > Sort Rows keeps the sort, so new rows land in order (SQ36).
        if (id.indexOf("sort:") === 0) { op("set_pattern_row_sort", {rowSort: id.slice(5)}); return true }
        if (id.indexOf("patternPlayback:") === 0) { op("set_pattern", {playback: id.slice(16)}); return true }
        if (id.indexOf("rowPlayback:") === 0) { if (selectedRowId) op("set_pattern_row", {row: selectedRowId, playback: id.slice(12)}); return true }
        if (id.indexOf("addRow:") === 0) { addRow(id.slice(7)); return true }
        if (id.indexOf("length:") === 0) { op("set_pattern", {lengthSteps: Number(id.slice(7))}); return true }
        return false
    }
    // Transpose the selection, else the selected row, else the pattern (SQ35).
    function transpose(semitones) {
        const a = selectionArgs()
        if (a) op("transpose_pattern", {row: a.row, steps: a.steps, semitones: semitones})
        else if (selectedRowId) op("transpose_pattern", {row: selectedRowId, semitones: semitones})
        else op("transpose_pattern", {semitones: semitones})
    }
    // Step rates ordered by duration from long to short (PatternExpand kRateTable ticks); up is faster.
    function nudgedRate(rate, delta) {
        const order = ["4", "2", "1D", "1", "2D", "1T", "1/2", "4D", "2T", "1/4", "8D", "4T", "1/8", "16D", "8T", "1/16", "32D", "16T", "1/32", "64D", "32T", "1/64"]
        const i = order.indexOf(rate || "1/16")
        return order[Math.max(0, Math.min(order.length - 1, (i < 0 ? order.indexOf("1/16") : i) + delta))]
    }
    function cycleMode(delta) {
        const list = Modes.MODES.map(m => m.value)
        const i = list.indexOf(editMode === "value" ? "velocity" : editMode)
        editMode = list[(i + delta + list.length) % list.length]
    }
    // spec: "<group id>:<choice index>" into sequencer.addRowGroups. A degree row
    // switches the pitch source to the chord track in the same undo entry (SQ19).
    function addRow(spec) {
        const parts = spec.split(":")
        const group = controller.addRowGroups.find(g => g.id === parts[0])
        const choice = group ? group.choices[Number(parts[1])] : null
        if (!choice) return
        const row = {assignment: choice.assignment}
        if (choice.name) row.name = choice.name
        const list = []
        if (choice.assignment.type === "degree" && settings.pitchSource !== "chords") list.push({op: "set_pattern", args: {pitchSource: "chords"}})
        list.push({op: "add_pattern_rows", args: {rows: [row]}})
        ops(list)
    }

    // Keys (SQ34, SQ35). Names are macOS: Command is Ctrl in Qt, Control is Meta.
    // Off macOS (D106) Command is Ctrl, Option is Alt and Control is Ctrl+Alt; an
    // Option-Command chord keeps its key and the Control action is menu-only.
    readonly property var playbackKeys: ({"]": "forward", "[": "backward", "p": "pingPong", "\\": "shuffle", "y": "pendulum", "u": "wander", "j": "random"})
    function keyAction(event, cmd, alt, shift, ctl) {
        const k = event.key
        const del = k === Qt.Key_Backspace || k === Qt.Key_Delete
        const plain = !cmd && !alt && !ctl
        const ch = event.text.length === 1 ? event.text.toLowerCase() : ""
        if (cmd && !alt && !ctl && k === Qt.Key_Z) return shift ? "redo" : "undo"
        if (ctl && alt && !cmd && !shift && k === Qt.Key_S) return "onOffMode"
        if (alt && !cmd && !ctl && k === Qt.Key_PageDown) return "nextMode"
        if (alt && !cmd && !ctl && k === Qt.Key_PageUp) return "previousMode"
        if (cmd && alt && ctl && k === Qt.Key_Left) return "rotatePatternLeft"
        if (cmd && alt && ctl && k === Qt.Key_Right) return "rotatePatternRight"
        if (cmd && alt && !ctl && k === Qt.Key_Left) return "rotateRowLeft"
        if (cmd && alt && !ctl && k === Qt.Key_Right) return "rotateRowRight"
        if (alt && shift && !cmd && !ctl && k === Qt.Key_Left) return "rotateModeLeft"
        if (alt && shift && !cmd && !ctl && k === Qt.Key_Right) return "rotateModeRight"
        if (alt && !cmd && !ctl && k === Qt.Key_Up) return shift ? "transposeOctaveUp" : "transposeUp"
        if (alt && !cmd && !ctl && k === Qt.Key_Down) return shift ? "transposeOctaveDown" : "transposeDown"
        if (ctl && cmd && !alt && k === Qt.Key_Right) return shift ? "expandAll" : "expandRow"
        if (ctl && cmd && !alt && k === Qt.Key_Left) return shift ? "collapseAll" : "collapseRow"
        if (ctl && shift && cmd && del) return "clearPattern"
        if (ctl && cmd && del) return "clearRow"
        if (alt && shift && cmd && del) return "clearPatternMode"
        if (alt && cmd && del) return "clearRowMode"
        if (shift && cmd && del) return "deleteUnused"
        if (cmd && del) return "deleteRow"
        if (ctl && del) return "clearStep"
        if (ctl && shift && cmd && k === Qt.Key_M) return "mono"
        if (ctl && shift && !cmd && k === Qt.Key_M) return "muteRow"
        if (ctl && shift && !cmd && k === Qt.Key_S) return "soloRow"
        if (shift && plain && (k === Qt.Key_Return || k === Qt.Key_Enter)) return "renameRow"
        if (alt && shift && cmd && k === Qt.Key_R) return "randomizeSteps"
        if (alt && cmd && !ctl && k === Qt.Key_R) return "randomizeAll"
        if (shift && cmd && !alt && k === Qt.Key_R) return "randomizeRows"
        if (cmd && !alt && !shift && !ctl && k === Qt.Key_R) return "repeatStep"
        if (cmd && !alt && !shift && !ctl && k === Qt.Key_X) return "cutSteps"
        if (cmd && !alt && !shift && !ctl && k === Qt.Key_C) return "copySteps"
        if (cmd && !alt && !shift && !ctl && k === Qt.Key_V) return "pasteSteps"
        if (alt && shift && !cmd && !ctl && k === Qt.Key_V) return "pasteSteps"
        if (cmd && !alt && !shift && !ctl && k === Qt.Key_D) return "duplicateRowNext"
        if (ctl && !cmd && !alt && !shift && k === Qt.Key_C) return "copyRow"
        if (ctl && !cmd && !alt && !shift && k === Qt.Key_V) return "pasteRow"
        if (ctl && !cmd && !alt && shift && k === Qt.Key_V) return "pasteNewRow"
        if (ctl && !cmd && alt && shift && k === Qt.Key_V) return "pasteRowSettings"
        if (alt && shift && !cmd && !ctl && k === Qt.Key_B) return "browser"
        if (alt && !cmd && !ctl && k === Qt.Key_QuoteLeft) return "nextPage"
        const plus = k === Qt.Key_Equal || k === Qt.Key_Plus
        const minus = k === Qt.Key_Minus
        if ((plus || minus) && ctl && shift && !cmd && !alt) return plus ? "patternRateUp" : "patternRateDown"
        if ((plus || minus) && ctl && alt && !cmd) return plus ? "loopStartUp" : "loopStartDown"
        if ((plus || minus) && ctl && !cmd && !alt && !shift) return plus ? "rowRateUp" : "rowRateDown"
        if ((plus || minus) && alt && cmd && !ctl) return plus ? "loopEndUp" : "loopEndDown"
        const playback = playbackKeys[ch]
        if (playback && ctl && alt && !cmd) return "patternPlayback:" + playback
        if (playback && ctl && !alt && !cmd) return "rowPlayback:" + playback
        if (plain && !shift && ch === "'") return "toggleStep"
        return ""
    }
    // The action for a key event ({key, text}) and its modifiers. Off macOS,
    // Ctrl+Alt first tries Command-Option, then Control, then Control-Option,
    // so Control-Option-S (On/Off) stays reachable.
    function resolveKeyAction(event, modifiers, mac) {
        const ctrl = (modifiers & Qt.ControlModifier) !== 0
        const alt = (modifiers & Qt.AltModifier) !== 0
        const shift = (modifiers & Qt.ShiftModifier) !== 0
        const meta = (modifiers & Qt.MetaModifier) !== 0
        if (mac) return keyAction(event, ctrl, alt, shift, meta)
        let action = keyAction(event, ctrl, alt, shift, false)
        if (!action && ctrl && alt) action = keyAction(event, false, false, shift, true)
        if (!action && ctrl && alt) action = keyAction(event, false, true, shift, true)
        return action
    }
    Keys.onReleased: event => { keyModifiers = event.modifiers }
    Keys.onPressed: event => {
        keyModifiers = event.modifiers
        const mac = Qt.platform.os === "osx"
        const ctrl = (event.modifiers & Qt.ControlModifier) !== 0
        const alt = (event.modifiers & Qt.AltModifier) !== 0
        const shift = (event.modifiers & Qt.ShiftModifier) !== 0
        const meta = (event.modifiers & Qt.MetaModifier) !== 0
        const action = resolveKeyAction(event, event.modifiers, mac)
        const plain = !ctrl && !alt && !(mac && meta)
        if (!action && plain && !shift && event.text.length === 1) {
            const m = Modes.modeForKey(event.text.toLowerCase())
            if (m) { editMode = m; event.accepted = true; return }
        }
        if (action === "onOffMode") { editMode = "onOff"; event.accepted = true; return }
        if (!action && plain && (event.key === Qt.Key_Left || event.key === Qt.Key_Right)) {
            moveSelection(event.key === Qt.Key_Left ? -1 : 1, shift)
            event.accepted = true
            return
        }
        if (!action && plain && !shift && (event.key === Qt.Key_Up || event.key === Qt.Key_Down)) {
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
        Loader {
            id: browser
            // Keep search and scroll state after its first use.
            active: root.browserVisible || root.browserLoaded
            visible: root.browserVisible
            width: visible ? root.sideWidth : 0
            height: parent.height
            sourceComponent: StepSequencerBrowser {
                objectName: "stepSequencerBrowser"
                panel: root
            }
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
            model: controller.rowModel
            reuseItems: true
            cacheBuffer: Math.round(root.rowHeight)
            boundsBehavior: Flickable.StopAtBounds
            delegate: StepSequencerRow {
                panel: root
            }
            WheelHandler {
                acceptedModifiers: Qt.ShiftModifier
                onWheel: event => {
                    const max = Math.max(0, root.stepX(root.maxLength) - root.gridWidth)
                    root.scrollX = Math.max(0, Math.min(max, root.scrollX - event.angleDelta.y))
                }
            }
        }
        Rectangle {
            objectName: "stepSequencerRecordMarker"
            x: grid.x + root.headerWidth + root.stepX(controller.recordStep) - root.scrollX
            y: grid.y
            width: Ui.Metrics.focus
            height: grid.height
            color: Ui.Theme.borderFocus
            visible: controller.stepRecording && x >= grid.x + root.headerWidth && x < grid.x + grid.width
        }
        Ui.EmptyState {
            objectName: "stepSequencerEmptyState"
            anchors.centerIn: grid
            width: Math.min(grid.width - Ui.Metrics.xxl, Ui.Metrics.dialogCompactWidth)
            maxTextWidth: width
            visible: !controller.valid
            readonly property bool hasMidiTrack: controller.firstMidiTrackId !== ""
            title: controller.convertible ? qsTr("This MIDI region has no pattern") : qsTr("No pattern region")
            message: controller.convertible
                ? qsTr("Convert it to a pattern region to edit it in the Step Sequencer.")
                : hasMidiTrack
                    ? qsTr("A pattern region is a MIDI region with a step grid. Create one, select one in the tracks area, or load one from the Pattern Browser.")
                    : qsTr("A pattern region is a MIDI region with a step grid. Add a MIDI track to create one.")
            actionText: controller.convertible ? qsTr("Convert to Pattern Region") : qsTr("New Pattern Region")
            actionEnabled: controller.convertible || hasMidiTrack
            onActionTriggered: root.runAction(controller.convertible ? "convertToPattern" : "newPatternRegion")
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

    Loader {
        id: rowMenu
        active: false
        sourceComponent: Ui.ContextMenu {
            objectName: "stepSequencerRowContextMenu"
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
    }
    function openRowMenu(rowId, item, x, y) {
        selectedRowId = rowId
        rowMenu.active = true
        if (rowMenu.item) rowMenu.item.popupAt(item, x, y)
    }
    Loader {
        id: stepMenu
        active: false
        sourceComponent: Ui.ContextMenu {
            objectName: "stepSequencerStepContextMenu"
            entries: [
                {id: "toggleStep", label: qsTr("Toggle Step")},
                {id: "clearStep", label: qsTr("Clear Step")},
                {id: "randomizeSteps", label: qsTr("Randomize Selected Steps")}
            ]
            onEntryTriggered: id => root.runAction(id)
        }
    }
    function openStepMenu(rowId, step, item, x, y) {
        if (!isStepSelected(rowId, step)) selectStep(rowId, step, false)
        stepMenu.active = true
        if (stepMenu.item) stepMenu.item.popupAt(item, x, y)
    }
    Ui.Dialog {
        id: saveDialog
        objectName: "stepSequencerSaveDialog"
        property string patternKind: "pattern"
        title: patternKind === "template" ? qsTr("Save Template") : qsTr("Save Pattern")
        returnFocusTo: root
        width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width : Ui.Metrics.dialogCompactWidth)
        onOpened: saveField.forceActiveFocus(Qt.PopupFocusReason)
        Column {
            width: parent ? parent.width : Ui.Metrics.panelWidth
            spacing: Ui.Metrics.md
            Ui.TextField {
                id: saveField
                objectName: "stepSequencerSaveName"
                width: parent.width
                accessibleName: qsTr("Pattern Name")
                onAccepted: saveDialog.save(text)
            }
            Ui.EditorButton {
                text: qsTr("Save")
                enabled: saveField.text.trim() !== ""
                onClicked: saveDialog.save(saveField.text)
            }
        }
        function save(name) {
            if (!visible || !String(name).trim()) return
            const result = controller.savePattern(String(name).trim(), patternKind, "")
            if (result.ok) close()
        }
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

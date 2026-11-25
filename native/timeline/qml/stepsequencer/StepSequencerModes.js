.pragma library
// Pure Step Sequencer view rules (web stepSequencerModel.ts): edit modes, value
// ranges, cell text, value line height and tie spans. Rows are the controller's
// row maps, whose `steps` are normalized steps.

var STEP_RATES = ["4", "2", "1", "1/2", "1/4", "1/8", "1/16", "1/32", "1/64", "1T", "2T",
                  "4T", "8T", "16T", "32T", "1D", "2D", "4D", "8D", "16D", "32D", "64D"]

var PLAYBACK = [
    {value: "forward", label: "Forward", glyph: "→"},
    {value: "backward", label: "Reverse", glyph: "←"},
    {value: "pingPong", label: "Ping-Pong", glyph: "↔"},
    {value: "shuffle", label: "Shuffle", glyph: "⇄"},
    {value: "pendulum", label: "Pendulum", glyph: "⇋"},
    {value: "wander", label: "Wander", glyph: "∿"},
    {value: "random", label: "Random", glyph: "?"}
]

// Edit modes in selector order (p. 735), with the field each writes and its key.
var MODES = [
    {value: "onOff", label: "On/Off", kind: "bool", field: "on", key: ""},
    {value: "velocity", label: "Velocity/Value", kind: "number", field: "velocity", key: "v"},
    {value: "gate", label: "Gate", kind: "number", field: "gate", unit: "%", key: "g"},
    {value: "tie", label: "Tie", kind: "bool", field: "tie", key: "t"},
    {value: "note", label: "Note", kind: "number", field: "note", key: "n"},
    {value: "octave", label: "Octave", kind: "number", field: "octave", key: "o"},
    {value: "repeat", label: "Repeat", kind: "number", field: "repeat", key: "r"},
    {value: "chance", label: "Chance", kind: "number", field: "chance", unit: "%", key: "c"},
    {value: "offset", label: "Offset", kind: "number", field: "offset", unit: "%", key: "f"},
    {value: "stepRate", label: "Step Rate", kind: "rate", field: "stepRate", key: "a"},
    {value: "skip", label: "Skip", kind: "bool", field: "skip", key: "k"},
    {value: "loop", label: "Loop", kind: "loop", field: "", key: "l"}
]

function spec(mode) {
    if (mode === "value") return {value: "value", label: "Value", kind: "number", field: "value", key: "v"}
    for (var i = 0; i < MODES.length; ++i) if (MODES[i].value === mode) return MODES[i]
    return MODES[0]
}

function modeForKey(key) {
    for (var i = 0; i < MODES.length; ++i) if (MODES[i].key && MODES[i].key === key) return MODES[i].value
    return ""
}

function modeLabel(mode) { return spec(mode).label }

function isAutomation(row) { return row.type === "automation" }

// Velocity reads as Value on automation rows (SQ30).
function effectiveMode(row, mode) {
    if (mode === "velocity" && isAutomation(row)) return "value"
    if (mode === "value" && !isAutomation(row)) return "velocity"
    return mode
}

function supportsMode(row, mode) {
    if (isAutomation(row)) return ["velocity", "gate", "tie", "note", "octave", "repeat"].indexOf(mode) < 0 || mode === "velocity"
    return mode !== "value"
}

function isDeviceValue(row, mode) { return mode === "value" && isAutomation(row) && row.targetKind === "device" }

function range(row, mode) {
    switch (mode) {
    case "velocity": return {min: 1, max: 127}
    case "value":
        if (row.targetKind === "pitchBend") return {min: -8192, max: 8191}
        if (row.targetKind === "device") return {min: 0, max: 1}
        return {min: 0, max: 127}
    case "gate": return {min: 1, max: 100}
    case "note": return {min: -12, max: 12}
    case "octave": return {min: -2, max: 8}
    case "repeat": return {min: 1, max: 16}
    case "chance": return {min: 0, max: 100}
    case "offset": return {min: -50, max: 50}
    case "stepRate": return {min: 0, max: STEP_RATES.length - 1}
    default: return {min: 0, max: 1}
    }
}

function baseOctave(row) {
    var a = row.assignment || {}
    if (a.type === "degree") return a.octave
    if (a.type === "note" || a.type === "melodic") return Math.floor(a.pitch / 12) - 2
    return 3
}

// The numeric value of `mode` on one step after defaults. Booleans are 0 or 1.
function value(row, index, mode) {
    var n = row.steps[index] || {}
    switch (mode) {
    case "onOff": return n.on ? 1 : 0
    case "tie": return n.tie ? 1 : 0
    case "skip": return n.skip ? 1 : 0
    case "velocity": return n.velocity
    case "value": return n.value !== undefined ? n.value : range(row, "value").min
    case "gate": return n.gate
    case "note": return n.note
    case "octave": return n.octave !== undefined ? n.octave : baseOctave(row)
    case "repeat": return n.repeat
    case "chance": return n.chance
    case "offset": return n.offset
    case "stepRate": return STEP_RATES.indexOf(n.stepRate !== undefined ? n.stepRate : row.stepRate)
    case "loop": return index >= row.loopStart && index < row.loopEnd ? 1 : 0
    }
    return 0
}

function fraction(row, index, mode) {
    var r = range(row, mode)
    return r.max === r.min ? 0 : (value(row, index, mode) - r.min) / (r.max - r.min)
}

function fromFraction(row, mode, f) {
    var r = range(row, mode)
    var raw = r.min + (r.max - r.min) * Math.max(0, Math.min(1, f))
    return isDeviceValue(row, mode) ? Math.round(raw * 1000) / 1000 : Math.round(raw)
}

function noteName(pitch) {
    var names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    return names[((pitch % 12) + 12) % 12] + (Math.floor(pitch / 12) - 2)
}

// The text a cell shows bottom-left: `47`, `100%`, `B-1`, `-1`, `1/16`.
function textFor(row, mode, v) {
    var s = spec(mode)
    if (mode === "note") {
        var a = row.assignment || {}
        if ((a.type === "note" || a.type === "melodic") && a.pitch !== undefined) return noteName(Math.max(0, Math.min(127, a.pitch + v)))
        return v > 0 ? "+" + v : String(v)
    }
    if (mode === "stepRate") return STEP_RATES[v] || row.stepRate
    if (s.kind === "bool" || s.kind === "loop") return ""
    if (isDeviceValue(row, mode)) return Math.round(v * 100) + "%"
    return s.unit ? v + s.unit : String(v)
}

function text(row, index, mode) { return textFor(row, mode, value(row, index, mode)) }

// The step patch a value writes: stepRate stores the rate name.
function patch(mode, v) {
    var s = spec(mode)
    var out = {}
    if (!s.field) return out
    out[s.field] = mode === "stepRate" ? STEP_RATES[v] : (s.kind === "bool" ? !!v : v)
    return out
}

// Inclusive span [start, end] of the tie cell that holds `index`.
function tieSpanAt(row, index) {
    var start = index
    while (start > 0 && row.steps[start] && row.steps[start].tie) start--
    if (!(row.steps[start] && row.steps[start].on)) return {start: index, end: index}
    var end = start
    while (end + 1 < row.lengthSteps && row.steps[end + 1] && row.steps[end + 1].tie) end++
    if (index > end) return {start: index, end: index}
    return {start: start, end: end}
}

// True when step `index` continues a tie from the step before it.
function continuesTie(row, index) {
    if (index <= 0 || !(row.steps[index] && row.steps[index].tie)) return false
    var span = tieSpanAt(row, index)
    return span.start < index
}

// 1-based step spec for the agent operations ("1,5,9").
function oneBased(indices) {
    return indices.map(function (i) { return i + 1 }).join(",")
}

// The icon for a row: kit piece, note, automation (SQ29).
function rowIcon(row) {
    if (row.type === "automation") return "showChart"
    if (row.type === "kit") return "graphicEq"
    if (row.type === "degree") return "linearScale"
    return "audiotrack"
}

// Row colors when a row has none: the track palette (SQ29).
var ROW_PALETTE = ["#22d3ee", "#50fa7b", "#ffb86c", "#e879f9", "#4f7cc4", "#ff5c5c", "#f2c43d", "#7cf2c4"]

function rowColor(row, index) {
    if (row.color && /^#[0-9a-fA-F]{6}$/.test(row.color)) return row.color
    return ROW_PALETTE[index % ROW_PALETTE.length]
}

// Step indices from a to b inclusive, in either order.
function span(a, b) {
    var out = []
    for (var i = Math.min(a, b); i <= Math.max(a, b); ++i) out.push(i)
    return out
}

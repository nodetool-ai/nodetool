.pragma library
// The piano roll's tools and the pure rules behind them (web pianoRollTools.ts).
// The gestures in PianoRollPanel call these, so each rule is testable without a pointer.
// Notes are plain objects {id, pitch, velocity, startTick, durationTick, ...}.
.import "PianoRollNotes.js" as Notes

var MIDI_PPQ = 960
var SIXTEENTH = MIDI_PPQ / 4

// Every tool, in the order the tool menus list them.
var TOOLS = [
    {tool: "pointer", label: "Pointer", icon: "toolSelect", cursor: "arrow"},
    {tool: "pencil", label: "Pencil", icon: "editOutlined", cursor: "cross"},
    {tool: "eraser", label: "Eraser", icon: "deleteOutline", cursor: "forbidden"},
    {tool: "brush", label: "Brush", icon: "brushOutlined", cursor: "cross"},
    {tool: "scissors", label: "Scissors", icon: "contentCut", cursor: "sizeHor"},
    {tool: "glue", label: "Glue", icon: "link", cursor: "pointingHand"},
    {tool: "mute", label: "Mute", icon: "volumeOffOutlined", cursor: "pointingHand"},
    {tool: "velocity", label: "Velocity", icon: "graphicEq", cursor: "sizeVer"},
    {tool: "quantize", label: "Quantize", icon: "alignHorizontalLeft", cursor: "whatsThis"}
]

function toolInfo(tool) {
    for (var i = 0; i < TOOLS.length; ++i) if (TOOLS[i].tool === tool) return TOOLS[i]
    return TOOLS[0]
}

// The tool a press uses: the second tool while Cmd (macOS) or Ctrl is down.
// Qt maps Cmd to the control modifier on macOS, so the flag is the same on every system.
function resolveTool(secondHeld, tool, altTool) { return secondHeld ? altTool : tool }

// Whether a drag skips the snap: Control on macOS (Qt's meta modifier), never elsewhere.
function bypassesSnap(metaHeld, mac) { return !!mac && !!metaHeld }

// ── Snap ────────────────────────────────────────────────────────────────


// The snap choices: Smart, then the grid divisions the roll offers.
var SNAP_OPTIONS = [
    {label: "Smart", value: "smart"},
    {label: "Bar", value: "bar"},
    {label: "Beat", value: "beat"},
    {label: "1/4", value: "1/4"},
    {label: "1/8", value: "1/8"},
    {label: "1/16", value: "1/16"},
    {label: "1/32", value: "1/32"},
    {label: "1/8 Triplet", value: "1/8T"},
    {label: "1/16 Triplet", value: "1/16T"}
]

// Ticks of the lines at `step`, anchored at `phase`, between two ticks. Capped.
function stepLineTicks(fromTick, toTick, step, phase) {
    var out = []
    if (!(step > 0) || !isFinite(fromTick) || !isFinite(toTick)) return out
    var first = Math.ceil((fromTick - phase) / step - 1e-9)
    for (var n = 0; n < 4000; ++n) {
        var tick = phase + (first + n) * step
        if (tick > toTick) break
        if (tick >= 0) out.push(tick)
    }
    return out
}

// ── Quantize ────────────────────────────────────────────────────────────

var QUANTIZE_OPTIONS = [
    {label: "1/4 Note", value: "1/4"},
    {label: "1/8 Note", value: "1/8"},
    {label: "1/16 Note", value: "1/16"},
    {label: "1/32 Note", value: "1/32"},
    {label: "1/8 Triplet", value: "1/8T"},
    {label: "1/16 Triplet", value: "1/16T"}
]

var DIVISION_TICKS = {"1/4": MIDI_PPQ, "1/8": MIDI_PPQ / 2, "1/16": MIDI_PPQ / 4, "1/32": MIDI_PPQ / 8,
                      "1/8T": (MIDI_PPQ / 2) * (2 / 3), "1/16T": (MIDI_PPQ / 4) * (2 / 3)}

function divisionTicks(division) { return DIVISION_TICKS[division] || SIXTEENTH }

// ── Scales ──────────────────────────────────────────────────────────────

var SCALES = [
    {value: "major", label: "Major", iv: [0, 2, 4, 5, 7, 9, 11]},
    {value: "minor", label: "Minor", iv: [0, 2, 3, 5, 7, 8, 10]},
    {value: "dorian", label: "Dorian", iv: [0, 2, 3, 5, 7, 9, 10]},
    {value: "mixolydian", label: "Mixolydian", iv: [0, 2, 4, 5, 7, 9, 10]},
    {value: "phrygian", label: "Phrygian", iv: [0, 1, 3, 5, 7, 8, 10]},
    {value: "lydian", label: "Lydian", iv: [0, 2, 4, 6, 7, 9, 11]},
    {value: "locrian", label: "Locrian", iv: [0, 1, 3, 5, 6, 8, 10]},
    {value: "harmMinor", label: "Harmonic Minor", iv: [0, 2, 3, 5, 7, 8, 11]},
    {value: "melMinor", label: "Melodic Minor", iv: [0, 2, 3, 5, 7, 9, 11]},
    {value: "phrygDom", label: "Phrygian Dom", iv: [0, 1, 4, 5, 7, 8, 10]},
    {value: "lydDom", label: "Lydian Dom", iv: [0, 2, 4, 6, 7, 9, 10]},
    {value: "locrian2", label: "Locrian ♮2", iv: [0, 2, 3, 5, 6, 8, 10]},
    {value: "altered", label: "Altered", iv: [0, 1, 3, 4, 6, 8, 10]},
    {value: "wholeTone", label: "Whole Tone", iv: [0, 2, 4, 6, 8, 10]},
    {value: "dimHW", label: "Dim Half-Whole", iv: [0, 1, 3, 4, 6, 7, 9, 10]},
    {value: "dimWH", label: "Dim Whole-Half", iv: [0, 2, 3, 5, 6, 8, 9, 11]},
    {value: "majPent", label: "Major Pent", iv: [0, 2, 4, 7, 9]},
    {value: "minPent", label: "Minor Pent", iv: [0, 3, 5, 7, 10]},
    {value: "blues", label: "Blues", iv: [0, 3, 5, 6, 7, 10]}
]

function scaleOptions(chromaticLabel) {
    var options = [{value: "chromatic", label: chromaticLabel}]
    for (var i = 0; i < SCALES.length; ++i) options.push({value: SCALES[i].value, label: SCALES[i].label})
    return options
}

var ROOT_OPTIONS = Notes.NOTE_NAMES.map(function(label, value) { return {value: value, label: label} })

// The intervals of a scale id, or null for Chromatic and unknown ids.
function scaleIntervals(id) {
    for (var i = 0; i < SCALES.length; ++i) if (SCALES[i].value === id) return SCALES[i].iv
    return null
}

var TONIC_PITCH_CLASS = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6,
                         "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}

// The scale root a document key names, else C.
function defaultScaleRoot(tonic) {
    var pc = TONIC_PITCH_CLASS[tonic]
    return pc === undefined ? 0 : pc
}

// ── Rows ────────────────────────────────────────────────────────────────

// {pitches, index} for Collapse Mode, or null for an empty clip.
function rowSet(notes) {
    var pitches = Notes.collapsedRows(notes)
    if (pitches.length === 0) return null
    var index = {}
    for (var i = 0; i < pitches.length; ++i) index[pitches[i]] = i
    return {pitches: pitches, index: index}
}

// Moves by whole rows: each moved note lands on the row `deltaRows` away, clamped to the first and last row.
function moveNotesByRows(notes, ids, deltaTick, deltaRows, rows) {
    var shifted = Notes.moveNotes(notes, ids, deltaTick, 0)
    if (deltaRows === 0 || !rows) return shifted
    var set = Notes.idSet(ids), last = rows.pitches.length - 1
    return shifted.map(function(note) {
        if (!set[note.id]) return note
        var row = rows.index[note.pitch]
        if (row === undefined) return note
        var target = Math.min(last, Math.max(0, row + Math.round(deltaRows)))
        return Notes.copyNote(note, {pitch: rows.pitches[target]})
    })
}

// Pulls the moved notes to the scale after a vertical move.
function snapMovedToScale(notes, ids, root, intervals) {
    return Notes.scaleQuantizeNotes(notes, root, intervals, ids)
}

// ── Pencil, brush ───────────────────────────────────────────────────────

// Where a pencil or brush press starts its note.
function stepStartTick(rawTick, snapped, step, phase) {
    return snapped ? Notes.snapTick(rawTick, step, phase, "floor") : Math.max(0, Math.round(rawTick))
}

function hasNoteAt(notes, pitch, startTick) {
    for (var i = 0; i < notes.length; ++i) if (notes[i].pitch === pitch && notes[i].startTick === startTick) return true
    return false
}

// One pencil or brush note: a snap step long at velocity 100.
function addStepNote(notes, id, pitch, startTick, step) {
    return notes.concat([{id: id, pitch: pitch, velocity: 100, startTick: startTick, durationTick: Math.max(1, Math.round(step))}])
}

// ── Velocity, mute ──────────────────────────────────────────────────────

// The velocity of the earliest selected note (ties: list order), or null.
function earliestVelocity(notes, ids) {
    var set = Notes.idSet(ids), best = null
    for (var i = 0; i < notes.length; ++i) {
        if (set[notes[i].id] && (best === null || notes[i].startTick < best.startTick)) best = notes[i]
    }
    return best ? best.velocity : null
}

// Mute or unmute: the clicked note's new state goes to the selection it is in.
function toggleMuteAt(notes, clickedId, ids) {
    var set = Notes.idSet(ids), clicked = null
    for (var i = 0; i < notes.length; ++i) if (notes[i].id === clickedId) clicked = notes[i]
    if (!clicked) return notes.slice()
    var mute = !clicked.muted
    var targets = set[clickedId] ? set : Notes.idSet([clickedId])
    return notes.map(function(note) {
        if (!targets[note.id]) return note
        var next = Notes.copyNote(note, {})
        if (mute) next.muted = true
        else delete next.muted
        return next
    })
}

// ── Selection ───────────────────────────────────────────────────────────

// Notes starting at or after the earliest selected start, or at or after the playhead.
function selectFollowing(notes, ids, playheadTick) {
    var set = Notes.idSet(ids), from = playheadTick, any = false
    for (var i = 0; i < notes.length; ++i) {
        if (!set[notes[i].id]) continue
        from = any ? Math.min(from, notes[i].startTick) : notes[i].startTick
        any = true
    }
    return notes.filter(function(n) { return n.startTick >= from }).map(function(n) { return n.id })
}

// Every note whose pitch is in the selection.
function selectSamePitch(notes, ids) {
    var set = Notes.idSet(ids), pitches = {}
    for (var i = 0; i < notes.length; ++i) if (set[notes[i].id]) pitches[notes[i].pitch] = true
    return notes.filter(function(n) { return pitches[n.pitch] }).map(function(n) { return n.id })
}

function selectMuted(notes) { return notes.filter(function(n) { return n.muted }).map(function(n) { return n.id }) }

function invertSelection(notes, ids) {
    var set = Notes.idSet(ids)
    return notes.filter(function(n) { return !set[n.id] }).map(function(n) { return n.id })
}

// ── Position display ────────────────────────────────────────────────────

// Bar, beat, sixteenth and tick of a content tick, each counted from 1.
// `phase` is the grid anchor, so the bar matches the ruler.
function positionParts(tick, phase, beatTicks, beatsPerBar) {
    // Tempo conversion can put an integer beat duration a fraction of a tick above its boundary.
    // Normalize grid anchors, not the position: a position just before a beat must stay before it.
    if (Math.abs(beatTicks - Math.round(beatTicks)) < 1e-9) { beatTicks = Math.round(beatTicks) }
    if (tick !== phase && Math.abs(phase - Math.round(phase)) < 1e-9) { phase = Math.round(phase) }
    var barTicks = beatTicks * beatsPerBar
    var rel = tick - phase
    var bar = Math.floor(rel / barTicks)
    var intoBar = Math.max(0, rel - bar * barTicks)
    var beat = Math.floor(intoBar / beatTicks)
    var intoBeat = Math.max(0, intoBar - beat * beatTicks)
    var divisionsPerBeat = Math.max(1, Math.ceil(beatTicks / SIXTEENTH - 1e-9))
    var division = Math.min(divisionsPerBeat - 1, Math.floor(intoBeat / SIXTEENTH))
    var sub = Math.max(0, Math.min(SIXTEENTH - 1, Math.floor(intoBeat - division * SIXTEENTH + 1e-9)))
    return {bar: bar + 1, beat: beat + 1, division: division + 1, tick: sub + 1}
}

// `<note>  <bar> <beat> <division> <tick>`. A null tick gives no text.
function positionText(pitch, tick, phase, beatTicks, beatsPerBar) {
    if (tick === null || tick === undefined) return ""
    var p = positionParts(tick, phase, beatTicks, beatsPerBar)
    return (pitch === null || pitch === undefined ? "" : Notes.pitchName(pitch)) + "  " + p.bar + " " + p.beat + " " + p.division + " " + p.tick
}

// ── Catch ───────────────────────────────────────────────────────────────

// The scroll that puts the playhead at 5% of the visible width when it left the view, else the same scroll.
function catchScroll(playheadTick, scrollTick, visibleTicks) {
    if (playheadTick >= scrollTick && playheadTick <= scrollTick + visibleTicks) return scrollTick
    return Math.max(0, playheadTick - visibleTicks * 0.05)
}

// ── Zoom ────────────────────────────────────────────────────────────────

// Slider 0..1 <-> pxPerTick on a log scale between min and max.
function zoomToSlider(px, min, max) { return Math.log(px / min) / Math.log(max / min) }
function sliderToZoom(t, min, max) { return min * Math.pow(max / min, Math.max(0, Math.min(1, t))) }

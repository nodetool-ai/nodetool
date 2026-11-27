.pragma library
// The piano roll's note operations and pixel math (web pianoRollGeometry.ts
// and the note helpers PianoRoll.tsx uses). Pure functions over plain note
// objects {id, pitch, velocity, startTick, durationTick} and their optional
// fields {muted, channel, releaseVelocity, expression}: each returns a new
// array and never changes its input. A copy keeps every field.

var NOTE_END_GRIP_PX = 8
var DEFAULT_LOW_PITCH = 48
var DEFAULT_HIGH_PITCH = 72
var NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

function isBlackKey(pitch) {
    var semitone = ((pitch % 12) + 12) % 12
    return semitone === 1 || semitone === 3 || semitone === 6 || semitone === 8 || semitone === 10
}

// Scientific pitch notation, with middle C (60) as C4.
function pitchName(pitch) {
    return NOTE_NAMES[((pitch % 12) + 12) % 12] + (Math.floor(pitch / 12) - 1)
}

function tickToX(tick, geo) { return (tick - geo.scrollTick) * geo.pxPerTick }
function xToTick(x, geo) { return geo.pxPerTick > 0 ? geo.scrollTick + x / geo.pxPerTick : geo.scrollTick }
// Rows: with Collapse Mode `geo.rows` is {pitches, index} (the pitches that have notes, highest first)
// and `geo.topRow` the first visible row. Without it a row is one semitone from `geo.topPitch`.
function pitchToY(pitch, geo) {
    if (geo.rows) {
        var index = geo.rows.index[pitch]
        return index === undefined ? -2 * geo.rowHeight : (index - geo.topRow) * geo.rowHeight
    }
    return (geo.topPitch - pitch) * geo.rowHeight
}
function yToPitch(y, geo) {
    if (geo.rows) {
        if (!(geo.rowHeight > 0)) return geo.rows.pitches[0]
        var row = Math.max(0, Math.min(geo.rows.pitches.length - 1, Math.floor(y / geo.rowHeight) + geo.topRow))
        return geo.rows.pitches[row]
    }
    return geo.rowHeight > 0 ? geo.topPitch - Math.floor(y / geo.rowHeight) : geo.topPitch
}

// A note's rectangle. The width has a one-pixel floor so a short note stays visible and clickable.
function noteRect(note, geo) {
    return {x: tickToX(note.startTick, geo), y: pitchToY(note.pitch, geo),
            width: Math.max(1, note.durationTick * geo.pxPerTick), height: geo.rowHeight}
}

// The note under a point, or null. Later notes win, as they draw on top. The
// last grip pixels are the resize edge, capped at half the note's width so a
// narrow note can still be moved.
function hitTest(notes, x, y, geo) {
    for (var i = notes.length - 1; i >= 0; --i) {
        var r = noteRect(notes[i], geo)
        if (x < r.x || x >= r.x + r.width || y < r.y || y >= r.y + r.height) continue
        var grip = Math.min(NOTE_END_GRIP_PX, r.width / 2)
        return {note: notes[i], edge: x >= r.x + r.width - grip ? "end" : "body"}
    }
    return null
}

// Balanced interval trees per pitch, rebuilt only when note data changes.
function noteIndex(notes) {
    const pitches = Object.create(null), rowsById = Object.create(null)
    for (let i = 0; i < notes.length; ++i) {
        const note = notes[i], pitch = note.pitch
        rowsById[note.id] = i
        if (!pitches[pitch]) { pitches[pitch] = [] }
        pitches[pitch].push({note: note, order: i, start: note.startTick, end: note.startTick + note.durationTick})
    }
    function tree(entries, from, to) {
        if (from >= to) { return null }
        const mid = (from + to) >>> 1, node = entries[mid]
        node.left = tree(entries, from, mid)
        node.right = tree(entries, mid + 1, to)
        node.maxEnd = Math.max(node.end, node.left ? node.left.maxEnd : -Infinity, node.right ? node.right.maxEnd : -Infinity)
        return node
    }
    const roots = Object.create(null)
    roots.rowsById = rowsById
    for (const pitch of Object.keys(pitches)) {
        const entries = pitches[pitch]
        entries.sort((a,b) => a.start - b.start || a.order - b.order)
        roots[pitch] = tree(entries, 0, entries.length)
    }
    return roots
}

function queryNotes(index, fromTick, toTick, lowPitch, highPitch, counter) {
    const found = []
    function visit(node) {
        if (!node || node.maxEnd < fromTick) { return }
        if (counter) { ++counter.visits }
        visit(node.left)
        if (node.start <= toTick && node.end >= fromTick) { found.push(node) }
        if (node.start <= toTick) { visit(node.right) }
    }
    for (let pitch = Math.max(0, Math.ceil(lowPitch)); pitch <= Math.min(127, Math.floor(highPitch)); ++pitch) { visit(index[pitch]) }
    found.sort((a,b) => a.order - b.order)
    return found.map(entry => entry.note)
}

function hitTestIndexed(index, x, y, geo, counter) {
    const pitch = yToPitch(y, geo), tick = xToTick(x, geo)
    const candidates = queryNotes(index, tick - 1 / geo.pxPerTick, tick, pitch, pitch, counter)
    return hitTest(candidates, x, y, geo)
}

function viewportNotes(index, geo, width, height) {
    const a = yToPitch(0, geo), b = yToPitch(height, geo)
    return queryNotes(index, geo.scrollTick - 1 / geo.pxPerTick, xToTick(width, geo), Math.min(a,b), Math.max(a,b))
}

function notesInRectIndexed(index, fromTick, toTick, pitchA, pitchB) {
    return notesInRect(queryNotes(index, Math.min(fromTick,toTick), Math.max(fromTick,toTick), Math.min(pitchA,pitchB), Math.max(pitchA,pitchB)), fromTick,toTick,pitchA,pitchB)
}

// The pitch for the top row that centres the notes in a view of `rows` rows.
function initialTopPitch(notes, rows) {
    rows = Math.max(1, Math.floor(rows))
    var low = DEFAULT_LOW_PITCH, high = DEFAULT_HIGH_PITCH
    if (notes.length > 0) {
        low = 127; high = 0
        for (var i = 0; i < notes.length; ++i) { low = Math.min(low, notes[i].pitch); high = Math.max(high, notes[i].pitch) }
    }
    return clampTopPitch(Math.round((low + high) / 2 + rows / 2), rows)
}

// Keeps the view inside the 128 pitches there are rows for.
function clampTopPitch(pitch, rows) {
    return Math.min(127, Math.max(Math.min(127, Math.max(1, Math.floor(rows)) - 1), pitch))
}

// The grid tick nearest `tick` (or at or before it, for "floor") on a grid of
// `step` anchored at `phase`. Never before tick 0.
function snapTick(tick, step, phase, mode) {
    if (!isFinite(step) || step <= 0) return Math.max(0, Math.round(tick))
    var index = (tick - phase) / step
    var snapped = mode === "floor" ? Math.floor(index + 1e-9) : Math.round(index)
    return Math.max(0, Math.round(phase + snapped * step))
}

function idSet(ids) {
    var set = {}
    for (var i = 0; i < ids.length; ++i) set[ids[i]] = true
    return set
}

function copyNote(note, patch) {
    var next = {}
    for (var field in note) next[field] = note[field]
    for (var key in patch) next[key] = patch[key]
    return next
}

var EXPRESSION_KEYS = ["pitch", "volume", "pan", "brightness"]

var EXPRESSION_NEUTRAL = {pitch: 0, volume: 1, pan: 0, brightness: 0.5}

// The curve value at `tick`: the kind's neutral before the first point, linear between points, held after the last.
function expressionValueAt(points, key, tick) {
    if (points.length === 0 || tick < points[0].tick) return EXPRESSION_NEUTRAL[key]
    for (var i = 0; i < points.length; ++i) {
        if (points[i].tick >= tick) {
            if (i === 0 || points[i].tick === tick) return points[i].value
            var span = points[i].tick - points[i - 1].tick
            return points[i - 1].value + (points[i].value - points[i - 1].value) * (tick - points[i - 1].tick) / span
        }
    }
    return points[points.length - 1].value
}

// The expression of a note cut to `durationTick`: points past the end are dropped. A cut curve
// ends at `durationTick` with the value it had there.
function fitExpression(note) {
    if (!note.expression) return note
    var cut = {}, changed = false
    for (var i = 0; i < EXPRESSION_KEYS.length; ++i) {
        var key = EXPRESSION_KEYS[i], points = note.expression[key]
        if (!points) continue
        var kept = points.filter(function(p) { return p.tick <= note.durationTick })
        if (kept.length !== points.length) {
            changed = true
            if (kept.length === 0 || kept[kept.length - 1].tick < note.durationTick) {
                kept.push({tick: note.durationTick, value: Math.round(expressionValueAt(points, key, note.durationTick) * 100) / 100})
            }
        }
        cut[key] = kept
    }
    return changed ? copyNote(note, {expression: cut}) : note
}

// Divides the expression curves at `offset` ticks from the note start. Points
// before it stay on the left, the others go right with their ticks re-based.
function splitExpression(expression, offset) {
    var left = {}, right = {}, hasLeft = false, hasRight = false
    for (var i = 0; i < EXPRESSION_KEYS.length; ++i) {
        var key = EXPRESSION_KEYS[i], points = expression[key]
        if (!points) continue
        var l = [], r = []
        for (var j = 0; j < points.length; ++j) {
            if (points[j].tick < offset) l.push(points[j])
            else r.push({tick: points[j].tick - offset, value: points[j].value})
        }
        if (l.length > 0) { left[key] = l; hasLeft = true }
        if (r.length > 0) { right[key] = r; hasRight = true }
    }
    return {left: hasLeft ? left : null, right: hasRight ? right : null}
}

function withExpression(note, expression) {
    var next = copyNote(note, {})
    if (expression) next.expression = expression
    else delete next.expression
    return next
}

// Sets fields on the notes.
function patchNotes(notes, ids, patch) {
    var set = idSet(ids)
    return notes.map(function(note) { return set[note.id] ? copyNote(note, patch) : note })
}

// If any chosen note is unmuted, mutes them all. Otherwise unmutes them all.
function toggleMute(notes, ids) {
    var set = idSet(ids), anyUnmuted = false
    for (var i = 0; i < notes.length; ++i) if (set[notes[i].id] && !notes[i].muted) anyUnmuted = true
    return patchNotes(notes, ids, {muted: anyUnmuted})
}

// The value of `key` on the chosen notes (`fallback` when absent): {mixed, value}.
function commonValue(notes, ids, key, fallback) {
    var set = idSet(ids), seen = false, value = fallback
    for (var i = 0; i < notes.length; ++i) {
        if (!set[notes[i].id]) continue
        var v = notes[i][key] === undefined ? fallback : notes[i][key]
        if (seen && v !== value) return {mixed: true, value: value}
        seen = true; value = v
    }
    return {mixed: false, value: value}
}

// Moves the notes by ticks and semitones. The group keeps its shape: the
// shift is clamped so no note leaves tick 0 or the pitch range.
function moveNotes(notes, ids, deltaTick, deltaPitch) {
    var set = idSet(ids)
    var minStart = Infinity, minPitch = 127, maxPitch = 0
    for (var i = 0; i < notes.length; ++i) {
        if (!set[notes[i].id]) continue
        minStart = Math.min(minStart, notes[i].startTick)
        minPitch = Math.min(minPitch, notes[i].pitch)
        maxPitch = Math.max(maxPitch, notes[i].pitch)
    }
    if (minStart === Infinity) return notes.slice()
    var dt = Math.max(-minStart, Math.round(deltaTick))
    var dp = Math.max(-minPitch, Math.min(127 - maxPitch, Math.round(deltaPitch)))
    return notes.map(function(note) {
        return set[note.id] ? copyNote(note, {startTick: note.startTick + dt, pitch: note.pitch + dp}) : note
    })
}

// Changes the length of the notes by `deltaTick`, never below `minTick`.
function resizeNotes(notes, ids, deltaTick, minTick) {
    var set = idSet(ids)
    var floor = Math.max(1, Math.round(minTick || 1))
    return notes.map(function(note) {
        return set[note.id] ? fitExpression(copyNote(note, {durationTick: Math.max(floor, Math.round(note.durationTick + deltaTick))})) : note
    })
}

function removeNotes(notes, ids) {
    var set = idSet(ids)
    return notes.filter(function(note) { return !set[note.id] })
}

// Appends copies of the notes shifted by `offsetTick`, with new ids from `newId`.
function duplicateNotes(notes, ids, offsetTick, newId) {
    var set = idSet(ids)
    var copies = []
    for (var i = 0; i < notes.length; ++i) {
        if (set[notes[i].id]) copies.push(copyNote(notes[i], {id: newId(), startTick: notes[i].startTick + offsetTick}))
    }
    return notes.concat(copies)
}

// The ids of the notes a marquee touches. Ticks and pitches may come in either order.
function notesInRect(notes, fromTick, toTick, pitchA, pitchB) {
    var lowTick = Math.min(fromTick, toTick), highTick = Math.max(fromTick, toTick)
    var lowPitch = Math.min(pitchA, pitchB), highPitch = Math.max(pitchA, pitchB)
    var ids = []
    for (var i = 0; i < notes.length; ++i) {
        var n = notes[i]
        if (n.pitch < lowPitch || n.pitch > highPitch) continue
        if (n.startTick + n.durationTick <= lowTick || n.startTick >= highTick) continue
        ids.push(n.id)
    }
    return ids
}

// Splits the notes that cross `tick` in two. Returns {notes, ids}: the ids of both halves.
function splitNotes(notes, ids, tick, newId) {
    var set = idSet(ids)
    var result = [], resultIds = []
    tick = Math.round(tick)
    for (var i = 0; i < notes.length; ++i) {
        var note = notes[i]
        if (!set[note.id]) { result.push(note); continue }
        resultIds.push(note.id)
        var end = note.startTick + note.durationTick
        if (tick <= note.startTick || tick >= end) { result.push(note); continue }
        var right = copyNote(note, {id: newId(), startTick: tick, durationTick: end - tick})
        var left = copyNote(note, {durationTick: tick - note.startTick})
        if (note.expression) {
            var halves = splitExpression(note.expression, tick - note.startTick)
            left = withExpression(left, halves.left)
            right = withExpression(right, halves.right)
        }
        result.push(left, right)
        resultIds.push(right.id)
    }
    return {notes: result, ids: resultIds}
}

// Shifts the velocity of the notes by one amount, clamped so every note stays in 1..127.
function shiftVelocity(notes, ids, delta) {
    var set = idSet(ids)
    var low = 127, high = 1
    for (var i = 0; i < notes.length; ++i) {
        if (!set[notes[i].id]) continue
        low = Math.min(low, notes[i].velocity); high = Math.max(high, notes[i].velocity)
    }
    var shift = Math.max(1 - low, Math.min(127 - high, Math.round(delta)))
    return notes.map(function(note) { return set[note.id] ? copyNote(note, {velocity: note.velocity + shift}) : note })
}

// Copies placed with their first note at `atTick`.
function pasteNotes(copied, atTick, newId) {
    var first = Infinity
    for (var i = 0; i < copied.length; ++i) first = Math.min(first, copied[i].startTick)
    var offset = Math.max(0, Math.round(atTick)) - first
    return copied.map(function(note) { return copyNote(note, {id: newId(), startTick: note.startTick + offset}) })
}

// ── Logic-style note functions (LP21): same names and vectors as the web noteFunctions.ts ──

function channelOf(note) { return note.channel === undefined ? 0 : note.channel }

var VELOCITY_STOPS = [[1, 110, 91, 216], [32, 62, 123, 224], [56, 63, 180, 200], [80, 108, 191, 78],
                      [100, 201, 195, 63], [114, 224, 135, 58], [127, 224, 69, 58]]

// The note color for a velocity: a linear ramp through fixed stops. Returns [r, g, b].
function velocityColor(velocity) {
    var v = Math.min(127, Math.max(1, velocity))
    for (var i = 1; i < VELOCITY_STOPS.length; ++i) {
        var lo = VELOCITY_STOPS[i - 1], hi = VELOCITY_STOPS[i]
        if (v <= hi[0]) {
            var t = (v - lo[0]) / (hi[0] - lo[0])
            return [Math.round(lo[1] + (hi[1] - lo[1]) * t), Math.round(lo[2] + (hi[2] - lo[2]) * t),
                    Math.round(lo[3] + (hi[3] - lo[3]) * t)]
        }
    }
    var last = VELOCITY_STOPS[VELOCITY_STOPS.length - 1]
    return [last[1], last[2], last[3]]
}

// A color mixed `amount` (0..1) toward `target` ([r, g, b]), as a CSS string.
function mixColor(rgb, target, amount) {
    var out = []
    for (var i = 0; i < 3; ++i) out.push(Math.round(rgb[i] + (target[i] - rgb[i]) * amount))
    return "rgb(" + out[0] + "," + out[1] + "," + out[2] + ")"
}

// The nearest pitch in 0..127 inside the scale. A tie takes the lower pitch.
function snapPitchToScale(pitch, root, intervals) {
    var classes = {}, count = 0
    for (var i = 0; i < intervals.length; ++i) {
        var pc = (((root + intervals[i]) % 12) + 12) % 12
        if (!classes[pc]) { classes[pc] = true; ++count }
    }
    if (count === 0 || count >= 12) return pitch
    for (var d = 0; d <= 127; ++d) {
        var down = pitch - d
        if (down >= 0 && down <= 127 && classes[down % 12]) return down
        var up = pitch + d
        if (d > 0 && up >= 0 && up <= 127 && classes[up % 12]) return up
    }
    return pitch
}

// Snaps the pitch of the listed notes (all notes when `ids` is absent).
function scaleQuantizeNotes(notes, root, intervals, ids) {
    var set = ids ? idSet(ids) : null
    return notes.map(function(note) {
        return !set || set[note.id] ? copyNote(note, {pitch: snapPitchToScale(note.pitch, root, intervals)}) : note
    })
}

// Distinct pitches, highest first.
function collapsedRows(notes) {
    var seen = {}, out = []
    for (var i = 0; i < notes.length; ++i) if (!seen[notes[i].pitch]) { seen[notes[i].pitch] = true; out.push(notes[i].pitch) }
    return out.sort(function(a, b) { return b - a })
}

// Merges the selected notes and the clicked note that share pitch and channel.
function glueNotes(notes, selectedIds, clickedId) {
    var ids = idSet(selectedIds)
    ids[clickedId] = true
    var groups = {}, order = []
    for (var i = 0; i < notes.length; ++i) {
        if (!ids[notes[i].id]) continue
        var key = notes[i].pitch + ":" + channelOf(notes[i])
        if (!groups[key]) { groups[key] = []; order.push(key) }
        groups[key].push(notes[i])
    }
    var replace = {}, drop = {}
    for (var g = 0; g < order.length; ++g) {
        var group = groups[order[g]]
        if (group.length < 2) continue
        var first = group[0], end = -Infinity, start = Infinity
        for (var j = 0; j < group.length; ++j) {
            if (group[j].startTick < first.startTick) first = group[j]
            end = Math.max(end, group[j].startTick + group[j].durationTick)
            start = Math.min(start, group[j].startTick)
        }
        replace[first.id] = fitExpression(copyNote(first, {startTick: start, durationTick: end - start}))
        for (var k = 0; k < group.length; ++k) if (group[k] !== first) drop[group[k].id] = true
    }
    return notes.filter(function(n) { return !drop[n.id] }).map(function(n) { return replace[n.id] || n })
}

// Sorted distinct start ticks map each chord to the next chord in one sweep.
function nextStarts(notes, grouped) {
    const groups = Object.create(null), next = Object.create(null)
    for (const note of notes) {
        const key = grouped ? note.pitch + ":" + channelOf(note) : "all"
        if (!groups[key]) { groups[key] = [] }
        groups[key].push(note)
    }
    for (const key of Object.keys(groups)) {
        const entries = groups[key].slice().sort((a,b) => a.startTick - b.startTick)
        let later = Infinity
        for (let i = entries.length - 1; i >= 0; --i) {
            if (i + 1 < entries.length && entries[i].startTick < entries[i+1].startTick) { later = entries[i+1].startTick }
            next[entries[i].id] = later
        }
    }
    return next
}

// Extends each listed note to the next later start of any pitch.
function forceLegato(notes, ids) {
    const set = idSet(ids), next = nextStarts(notes, false)
    return notes.map(note => !set[note.id] || next[note.id] === Infinity ? note
        : fitExpression(copyNote(note, {durationTick: next[note.id] - note.startTick})))
}

// Cuts each listed note at the nearest later same-pitch, same-channel note.
function removeOverlaps(notes, ids) {
    const set = idSet(ids), next = nextStarts(notes, true)
    return notes.map(note => !set[note.id] || next[note.id] >= note.startTick + note.durationTick ? note
        : fitExpression(copyNote(note, {durationTick: next[note.id] - note.startTick})))
}

// Removes each listed note that has an earlier twin in list order.
function deleteDuplicates(notes, ids) {
    const set = idSet(ids), seen = new Set()
    return notes.filter(function(note) {
        const key = note.pitch + ":" + channelOf(note) + ":" + note.startTick
        const duplicate = seen.has(key)
        seen.add(key)
        return !set[note.id] || !duplicate
    })
}

// Resolves overlaps between the moved notes and the notes they landed on.
function applyNoOverlap(notes, movedIds) {
    var moved = idSet(movedIds), state = {}, removed = {}
    for (var i = 0; i < notes.length; ++i) state[notes[i].id] = notes[i]
    function shorten(id, durationTick) { state[id] = fitExpression(copyNote(state[id], {durationTick: durationTick})) }
    for (var a = 0; a < notes.length; ++a) {
        var m = notes[a]
        if (!moved[m.id]) continue
        for (var b = 0; b < notes.length; ++b) {
            var n = notes[b]
            if (moved[n.id] || removed[n.id]) continue
            var M = state[m.id], N = state[n.id]
            if (N.pitch !== M.pitch || channelOf(N) !== channelOf(M)) continue
            if (!(N.startTick < M.startTick + M.durationTick && M.startTick < N.startTick + N.durationTick)) continue
            if (N.startTick < M.startTick) shorten(N.id, M.startTick - N.startTick)
            else if (N.startTick > M.startTick) shorten(M.id, N.startTick - M.startTick)
            else removed[N.id] = true
        }
    }
    return notes.filter(function(n) { return !removed[n.id] }).map(function(n) { return state[n.id] })
}

// Transposes the notes by semitones, clamped to 0..127.
function transposeNotes(notes, ids, semitones) {
    var set = idSet(ids)
    return notes.map(function(note) {
        return set[note.id] ? copyNote(note, {pitch: Math.max(0, Math.min(127, note.pitch + semitones))}) : note
    })
}

// Time quantize. options: {step, phase, strength 0..1, swing 0..1, target "start" | "start_and_length"}.
// The older (notes, ids, step, phase) form snaps starts all the way, with no swing.
function quantizeWith(notes, ids, options) {
    var set = ids ? idSet(ids) : null
    var step = options.step, phase = options.phase || 0
    var strength = options.strength === undefined ? 1 : options.strength
    var swing = options.swing || 0
    var both = options.target === "start_and_length"
    return notes.map(function(note) {
        if (set && !set[note.id]) return note
        var k = Math.round((note.startTick - phase) / step)
        var odd = ((k % 2) + 2) % 2 === 1
        var target = phase + k * step + (odd ? Math.round(swing * step / 2) : 0)
        var startTick = Math.max(0, Math.round(note.startTick + (target - note.startTick) * strength))
        if (!both) return copyNote(note, {startTick: startTick})
        var lengthTarget = Math.max(step, Math.round(note.durationTick / step) * step)
        var durationTick = Math.max(1, Math.round(note.durationTick + (lengthTarget - note.durationTick) * strength))
        return fitExpression(copyNote(note, {startTick: startTick, durationTick: durationTick}))
    })
}

// The finest candidate step that is at least 16 px wide, else the bar.
function smartSnapTicks(pxPerTick, beatTicks, beatsPerBar) {
    var bar = beatTicks * beatsPerBar
    var all = [bar, beatTicks, 480, 240, 120], candidates = []
    for (var i = 0; i < all.length; ++i) if (candidates.indexOf(all[i]) < 0) candidates.push(all[i])
    candidates.sort(function(a, b) { return b - a })
    var best = bar
    for (var j = 0; j < candidates.length; ++j) if (candidates[j] * pxPerTick >= 16) best = candidates[j]
    return best
}


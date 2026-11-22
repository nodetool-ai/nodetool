.pragma library
// The piano roll's lane math: controller lanes (cc, pitch bend, pressure) and
// the per-note expression curves. Pure functions over plain objects: each
// returns a new array and never changes its input.
//   controller lane {id, kind, cc?, pitch?, channel?, interpolation?, points[{id, tick, value}]}
//   expression point {tick, value}, measured from the note start
// A lane "spec" names one lane: {kind, cc, pitch, channel}.

var MAX_POINTS = 4096
var MAX_EXPRESSION_POINTS = 256
var MAX_LANES = 32

var RANGES = {
    cc: {min: 0, max: 127, neutral: 0, integer: true},
    pitchBend: {min: -8192, max: 8191, neutral: 0, integer: true},
    channelPressure: {min: 0, max: 127, neutral: 0, integer: true},
    polyPressure: {min: 0, max: 127, neutral: 0, integer: true},
    pitch: {min: -48, max: 48, neutral: 0, integer: false},
    volume: {min: 0, max: 4, neutral: 1, integer: false},
    pan: {min: -1, max: 1, neutral: 0, integer: false},
    brightness: {min: 0, max: 1, neutral: 0.5, integer: false}
}

// The value range of a lane kind, or of an expression curve key.
function rangeOf(kind) { return RANGES[kind] || RANGES.cc }

function clampValue(value, range) {
    var v = Math.max(range.min, Math.min(range.max, value))
    return range.integer ? Math.round(v) : Math.round(v * 100) / 100
}

// Pixel math: the top of the lane is the range maximum. `usable` keeps the extremes inside the lane.
function valueToY(value, range, height, margin) {
    var usable = Math.max(1, height - 2 * margin)
    return margin + usable * (range.max - value) / (range.max - range.min)
}
function yToValue(y, range, height, margin) {
    var usable = Math.max(1, height - 2 * margin)
    return clampValue(range.max - (y - margin) / usable * (range.max - range.min), range)
}

function sameSpec(lane, spec) {
    return lane.kind === spec.kind && (lane.cc === undefined ? 0 : lane.cc) === (spec.cc === undefined ? 0 : spec.cc)
        && (lane.pitch === undefined ? 0 : lane.pitch) === (spec.pitch === undefined ? 0 : spec.pitch)
        && (lane.channel === undefined ? 0 : lane.channel) === (spec.channel === undefined ? 0 : spec.channel)
}

function findLane(lanes, spec) {
    for (var i = 0; i < lanes.length; ++i) if (sameSpec(lanes[i], spec)) return i
    return -1
}

function lanePoints(lanes, spec) {
    var index = findLane(lanes, spec)
    return index < 0 ? [] : lanes[index].points
}

// The lanes with the points of one lane replaced. A lane is created on its
// first point and removed with its last. Returns null when the lane cap is hit.
function setLanePoints(lanes, spec, points, newId) {
    var index = findLane(lanes, spec)
    if (points.length === 0) {
        return index < 0 ? lanes.slice() : lanes.filter(function(lane, i) { return i !== index })
    }
    if (index < 0) {
        if (lanes.length >= MAX_LANES) return null
        var lane = {id: newId(), kind: spec.kind, points: points}
        if (spec.kind === "cc") lane.cc = spec.cc
        if (spec.kind === "polyPressure") lane.pitch = spec.pitch
        if (spec.channel) lane.channel = spec.channel
        return lanes.concat([lane])
    }
    return lanes.map(function(existing, i) {
        if (i !== index) return existing
        var next = {}
        for (var key in existing) next[key] = existing[key]
        next.points = points
        return next
    })
}

// Sets the interpolation of a lane that exists.
function setInterpolation(lanes, spec, interpolation) {
    var index = findLane(lanes, spec)
    if (index < 0) return lanes.slice()
    return lanes.map(function(existing, i) {
        if (i !== index) return existing
        var next = {}
        for (var key in existing) next[key] = existing[key]
        next.interpolation = interpolation
        return next
    })
}

function sortPoints(points) {
    // Stable by tick: Array.prototype.sort is stable in the JS engine, the index keeps it explicit.
    return points.map(function(p, i) { return {p: p, i: i} })
        .sort(function(a, b) { return a.p.tick - b.p.tick || a.i - b.i })
        .map(function(entry) { return entry.p })
}

function pointCap(maxTick) { return maxTick === undefined ? MAX_POINTS : MAX_EXPRESSION_POINTS }

// Adds a point. `maxTick` (expression) caps the tick at the note length.
function addPoint(points, tick, value, range, id, maxTick) {
    if (points.length >= pointCap(maxTick)) return points.slice()
    var t = Math.max(0, Math.round(tick))
    if (maxTick !== undefined) t = Math.min(maxTick, t)
    var next = points.slice()
    var at = next.length
    while (at > 0 && next[at - 1].tick > t) --at
    next.splice(at, 0, {id: id, tick: t, value: clampValue(value, range)})
    return next
}

// Moves the chosen points by ticks and value, clamped so the group keeps its shape.
function movePoints(points, ids, deltaTick, deltaValue, range, maxTick) {
    var set = {}
    for (var i = 0; i < ids.length; ++i) set[ids[i]] = true
    var minTick = Infinity, maxChosen = 0
    for (var j = 0; j < points.length; ++j) {
        if (!set[points[j].id]) continue
        minTick = Math.min(minTick, points[j].tick)
        maxChosen = Math.max(maxChosen, points[j].tick)
    }
    if (minTick === Infinity) return points.slice()
    var dt = Math.max(-minTick, Math.round(deltaTick))
    if (maxTick !== undefined) dt = Math.min(dt, maxTick - maxChosen)
    return sortPoints(points.map(function(p) {
        return set[p.id] ? {id: p.id, tick: p.tick + dt, value: clampValue(p.value + deltaValue, range)} : p
    }))
}

function removePoints(points, ids) {
    var set = {}
    for (var i = 0; i < ids.length; ++i) set[ids[i]] = true
    return points.filter(function(p) { return !set[p.id] })
}

// Freehand drawing: sets the value at `tick`, replacing a point already there.
function drawPoint(points, tick, value, range, newId, maxTick) {
    var t = Math.max(0, Math.round(tick))
    if (maxTick !== undefined) t = Math.min(maxTick, t)
    for (var i = 0; i < points.length; ++i) {
        if (points[i].tick === t) {
            return points.map(function(p, j) { return j === i ? {id: p.id, tick: p.tick, value: clampValue(value, range)} : p })
        }
    }
    return addPoint(points, t, value, range, newId(), maxTick)
}

// Freehand stroke from (fromTick, fromValue) to (toTick, toValue), one point every `step` ticks.
// Sets values like drawPoint does, but sorts once per call. Adds stop at the lane cap.
function drawSegment(points, fromTick, fromValue, toTick, toValue, step, range, newId, maxTick) {
    var cap = pointCap(maxTick)
    // Both ends lie inside the lane before the stroke interpolates, so a pointer far outside it
    // neither spends loop steps nor bends the ramp.
    function inside(tick) {
        var t = Math.max(0, Math.round(tick))
        return maxTick === undefined ? t : Math.min(maxTick, t)
    }
    fromTick = inside(fromTick)
    toTick = inside(toTick)
    var direction = toTick >= fromTick ? 1 : -1
    var stride = Math.max(1, Math.round(step))
    var next = points.slice()
    var index = {}
    for (var i = 0; i < next.length; ++i) index[next[i].tick] = i
    function put(tick, value) {
        var t = Math.max(0, Math.round(tick))
        if (maxTick !== undefined) t = Math.min(maxTick, t)
        var at = index[t]
        if (at !== undefined) {
            next[at] = {id: next[at].id, tick: t, value: clampValue(value, range)}
        } else if (next.length < cap) {
            index[t] = next.length
            next.push({id: newId(), tick: t, value: clampValue(value, range)})
        }
    }
    for (var t = fromTick + direction * stride; direction * (toTick - t) >= 0; t += direction * stride) {
        var f = toTick === fromTick ? 1 : (t - fromTick) / (toTick - fromTick)
        put(t, fromValue + (toValue - fromValue) * f)
    }
    put(toTick, toValue)
    return sortPoints(next)
}

// The point nearest a pixel position within `radius`, or null.
function hitPoint(points, x, y, toPixel, radius) {
    var best = null, bestDistance = radius
    for (var i = points.length - 1; i >= 0; --i) {
        var p = toPixel(points[i])
        var distance = Math.max(Math.abs(p.x - x), Math.abs(p.y - y))
        if (distance <= bestDistance) { best = points[i]; bestDistance = distance }
    }
    return best
}

// Expression points carry no ids. The editor gives them index ids, and strips them on write.
function editableExpression(points) {
    return (points || []).map(function(p, i) { return {id: "e" + i, tick: p.tick, value: p.value} })
}
function storedExpression(points) {
    return points.map(function(p) { return {tick: p.tick, value: p.value} })
}

// The note with one expression curve replaced. An empty curve is removed.
function setNoteExpression(note, key, points) {
    var next = {}
    for (var field in note) next[field] = note[field]
    var expression = {}
    for (var k in (note.expression || {})) expression[k] = note.expression[k]
    if (points.length === 0) delete expression[key]
    else expression[key] = storedExpression(points)
    var any = false
    for (var e in expression) any = true
    if (any) next.expression = expression
    else delete next.expression
    return next
}

// The lane choices of the selector. A note's curves need exactly one selected note.
function laneOptions(singleNote) {
    var options = [
        {label: "Velocity", value: "velocity"},
        {label: "Pitch bend", value: "pitchBend"},
        {label: "Modulation (CC 1)", value: "cc:1"},
        {label: "Volume (CC 7)", value: "cc:7"},
        {label: "Pan (CC 10)", value: "cc:10"},
        {label: "Expression (CC 11)", value: "cc:11"},
        {label: "Sustain (CC 64)", value: "cc:64"},
        {label: "Channel pressure", value: "channelPressure"},
        {label: "Other CC", value: "cc:other"}
    ]
    if (singleNote) {
        options.push({label: "Note pitch", value: "note:pitch"}, {label: "Note volume", value: "note:volume"},
                     {label: "Note pan", value: "note:pan"}, {label: "Note brightness", value: "note:brightness"})
    }
    return options
}

// What a selector value means: {type: "velocity"} | {type: "controller", spec, range} | {type: "expression", key, range}.
function describeLane(value, otherCc) {
    if (value === "velocity" || !value) return {type: "velocity"}
    if (value.indexOf("note:") === 0) {
        var key = value.substring(5)
        return {type: "expression", key: key, range: rangeOf(key)}
    }
    if (value === "pitchBend" || value === "channelPressure") {
        return {type: "controller", spec: {kind: value, channel: 0}, range: rangeOf(value)}
    }
    var number = value === "cc:other" ? otherCc : parseInt(value.substring(3), 10)
    return {type: "controller", spec: {kind: "cc", cc: number, channel: 0}, range: rangeOf("cc")}
}

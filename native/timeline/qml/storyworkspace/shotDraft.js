.pragma library
// The shot editor's draft: every saved field as a flat string while the creator types, and one
// patch on Save. Pure functions, ported from web/src/components/storyboard/shotDraft.ts.

var KEYS = ["slug", "action", "dialogue", "durationSeconds", "durationSource", "framing", "angle", "movement",
            "equipment", "lens", "notes", "renderMode", "graphics", "motion", "endState", "sound"]
var CAMERA_KEYS = ["framing", "angle", "movement", "equipment", "lens"]

var LABELS = {
    slug: "Shot title", action: "Description", dialogue: "Dialogue", durationSeconds: "Duration",
    durationSource: "Duration source", framing: "Shot size", angle: "Camera angle", movement: "Camera movement",
    equipment: "Camera equipment", lens: "Focal length", notes: "Notes", renderMode: "Render mode",
    graphics: "Graphics", motion: "Shot motion", endState: "End state", sound: "Sound"
}

function text(value) { return value === undefined || value === null ? "" : String(value) }

function fromShot(shot) {
    var camera = shot.camera || {}
    return {
        slug: text(shot.slug), action: text(shot.action), dialogue: text(shot.dialogue),
        durationSeconds: shot.duration_seconds !== undefined && shot.duration_seconds !== null ? String(shot.duration_seconds) : "",
        durationSource: shot.duration_source, framing: text(camera.framing), angle: text(camera.angle),
        movement: text(camera.movement), equipment: text(camera.equipment), lens: text(camera.lens),
        notes: text(shot.notes), renderMode: shot.render_mode || "keyframe", graphics: shot.graphics,
        motion: text(shot.motion), endState: text(shot.end_state), sound: text(shot.sound)
    }
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

function changedKeys(draft, original) { return KEYS.filter(function (key) { return !same(draft[key], original[key]) }) }

function isDirty(draft, original) { return changedKeys(draft, original).length > 0 }

function conflictingKeys(draft, original, current) {
    return changedKeys(draft, original).filter(function (key) { return !same(current[key], original[key]) })
}

function parseDuration(raw) {
    var trimmed = text(raw).trim()
    if (trimmed === "") return null
    var seconds = Number(trimmed)
    return isFinite(seconds) && seconds > 0 ? seconds : null
}

function isDurationInvalid(raw) { return text(raw).trim() !== "" && parseDuration(raw) === null }

function orNull(value) { var trimmed = text(value).trim(); return trimmed === "" ? null : trimmed }

function withField(draft, key, value) {
    var next = Object.assign({}, draft)
    next[key] = value
    return next
}

// On a board whose script owns the words, a typed length pins the shot, and an empty field hands
// timing back to the voice takes. A half-typed number leaves the source alone.
function withDuration(draft, durationSeconds, linksLines) {
    var next = withField(draft, "durationSeconds", durationSeconds)
    if (!linksLines || isDurationInvalid(durationSeconds)) return next
    next.durationSource = parseDuration(durationSeconds) !== null ? "manual" : "audio"
    return next
}

function withDurationSourceToggled(draft) {
    return withField(draft, "durationSource", draft.durationSource === "manual" ? "audio" : "manual")
}

// The patch for the changed fields only. Camera values merge into the shot's current camera, so
// an edit made elsewhere to another camera field stays. A null value removes the field.
function patchFromChanged(draft, original, current) {
    var changed = changedKeys(draft, original)
    var has = function (key) { return changed.indexOf(key) >= 0 }
    var patch = {}
    if (has("slug")) patch.slug = orNull(draft.slug)
    if (has("action")) patch.action = text(draft.action).trim()
    if (has("dialogue")) patch.dialogue = orNull(draft.dialogue)
    if (has("notes")) patch.notes = orNull(draft.notes)
    if (has("durationSeconds")) patch.duration_seconds = parseDuration(draft.durationSeconds)
    if (has("durationSource")) patch.duration_source = draft.durationSource === undefined ? null : draft.durationSource
    if (has("renderMode")) patch.render_mode = draft.renderMode
    if (has("graphics")) patch.graphics = draft.graphics === undefined ? null : draft.graphics
    if (has("motion")) patch.motion = orNull(draft.motion)
    if (has("endState")) patch.end_state = orNull(draft.endState)
    if (has("sound")) patch.sound = orNull(draft.sound)
    if (CAMERA_KEYS.some(has)) {
        var camera = Object.assign({}, current.camera || {})
        CAMERA_KEYS.forEach(function (key) {
            if (!has(key)) return
            var value = orNull(draft[key])
            if (value === null) delete camera[key]
            else camera[key] = value
        })
        patch.camera = Object.keys(camera).length > 0 ? camera : null
    }
    return patch
}

// The shot as the draft would save it, for the prompt preview and the viewer.
function savedShot(shot, patch) {
    var next = Object.assign({}, shot)
    Object.keys(patch).forEach(function (key) {
        if (patch[key] === null) delete next[key]
        else next[key] = patch[key]
    })
    return next
}

function withCurrentFields(draft, current, keys) {
    var next = Object.assign({}, draft)
    keys.forEach(function (key) { next[key] = current[key] })
    return next
}

function formatValue(key, value) {
    if (value === undefined || value === null || value === "") return "Not set"
    if (typeof value === "object") return "Edited graphics"
    return String(value)
}

var CAMERA_LABELS = {
    "extreme wide": "Extreme wide", "wide": "Wide", "medium wide": "Medium wide", "medium": "Medium",
    "medium close-up": "Medium close-up", "close-up": "Close-up", "extreme close-up": "Extreme close-up",
    "over-the-shoulder": "Over-the-shoulder", "two-shot": "Two-shot", "insert": "Insert", "eye level": "Eye level",
    "low angle": "Low angle", "high angle": "High angle", "overhead": "Overhead", "bird's eye": "Bird's-eye view",
    "worm's eye": "Worm's-eye view", "dutch angle": "Dutch angle", "static": "Static", "slow push in": "Slow push in",
    "slow pull out": "Slow pull out", "pan left": "Pan left", "pan right": "Pan right", "tilt up": "Tilt up",
    "tilt down": "Tilt down", "dolly in": "Dolly in", "dolly out": "Dolly out", "tracking": "Tracking",
    "handheld": "Handheld", "crane up": "Crane up", "crane down": "Crane down", "orbit": "Orbit", "zoom in": "Zoom in",
    "zoom out": "Zoom out", "tripod": "Tripod", "steadicam": "Steadicam", "gimbal": "Gimbal", "dolly": "Dolly",
    "slider": "Slider", "crane": "Crane", "drone": "Drone", "macro": "Macro", "anamorphic": "Anamorphic"
}

// The suggested camera values plus an empty entry. A value the shot already carries stays an option.
function cameraOptions(suggestions, current) {
    var options = [{label: "—", value: ""}]
    suggestions.forEach(function (value) { options.push({label: CAMERA_LABELS[value] || value, value: value}) })
    if (current !== "" && suggestions.indexOf(current) < 0) options.push({label: current, value: current})
    return options
}

var FRAMING = ["extreme wide", "wide", "medium wide", "medium", "medium close-up", "close-up", "extreme close-up",
               "over-the-shoulder", "two-shot", "insert"]
var LENS = ["14mm", "18mm", "24mm", "28mm", "35mm", "50mm", "85mm", "135mm", "macro", "anamorphic"]
var ANGLE = ["eye level", "low angle", "high angle", "overhead", "bird's eye", "worm's eye", "dutch angle"]
var MOVEMENT = ["static", "slow push in", "slow pull out", "push in slow", "pull back reveal", "dolly in", "dolly out",
                "dolly zoom (vertigo)", "truck left", "truck right", "pedestal up", "pedestal down", "pan left", "pan right",
                "whip pan", "tilt up", "tilt down", "crane up", "crane down", "orbit", "orbit left", "orbit right", "360 orbit",
                "zoom in", "zoom out", "crash zoom in", "crash zoom out", "tracking", "handheld", "handheld follow",
                "FPV drone fly-through", "top-down rise", "snorricam", "bullet time", "rack focus", "through-object pass",
                "low-angle hero rise", "overhead spiral"]
var EQUIPMENT = ["handheld", "tripod", "steadicam", "gimbal", "dolly", "slider", "crane", "drone"]

// Shots grouped by scene in board order, as sceneOrder in the web app.
function sceneOrder(shots) {
    var sorted = shots.map(function (shot, position) { return {shot: shot, position: position} })
    sorted.sort(function (a, b) { return ((a.shot.index || 0) - (b.shot.index || 0)) || (a.position - b.position) })
    var groups = [], byKey = {}
    sorted.forEach(function (entry) {
        var key = entry.shot.scene_id || ""
        if (!byKey.hasOwnProperty(key)) { byKey[key] = {sceneId: key, shots: []}; groups.push(byKey[key]) }
        byKey[key].shots.push(entry.shot)
    })
    return groups
}

function displayNumber(shotId, shots) {
    var groups = sceneOrder(shots)
    for (var i = 0; i < groups.length; ++i) {
        for (var j = 0; j < groups[i].shots.length; ++j) {
            if (groups[i].shots[j].id === shotId) return {scene: i + 1, shot: j + 1, inScene: groups[i].shots.length}
        }
    }
    return {scene: 0, shot: 0, inScene: 0}
}

function sameMedia(a, b) {
    if (!a || !b) return false
    return b.asset_id ? a.asset_id === b.asset_id : a.uri === b.uri
}

function versions(shot, medium) {
    var key = medium === "clip" ? "clip" : "keyframe"
    if (shot[key + "_versions"]) return shot[key + "_versions"]
    return shot[key] ? [shot[key]] : []
}

function currentIndex(list, current) {
    if (!current) return 0
    for (var i = 0; i < list.length; ++i) { if (sameMedia(list[i], current)) return i }
    return 0
}

function isGenerating(shot) { return shot.status === "keyframe_generating" || shot.status === "clip_generating" }

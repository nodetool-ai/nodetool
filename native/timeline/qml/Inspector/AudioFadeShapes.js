.pragma library

var shapes = ["linear", "sCurve", "plus3dB", "minus3dB"]
var labels = {
    linear: "Linear",
    sCurve: "S-curve",
    plus3dB: "+3 dB",
    minus3dB: "-3 dB"
}
var hints = {
    linear: "A straight ramp in level.",
    sCurve: "Eased at both ends, straight through the middle.",
    plus3dB: "Louder through the middle — holds the level across a crossing fade.",
    minus3dB: "Quieter through the middle — the soft part of the fade lasts longer."
}
var options = shapes.map(function(shape) { return {value: shape, label: labels[shape]} })
function parseClipFadeShape(value) {
    return shapes.indexOf(value) >= 0 ? value : "linear"
}

function maxFadeMs(clip, edge) {
    const other = edge === "in" ? clip.fadeOutMs : clip.fadeInMs
    return Math.max(0, clip.durationMs - Math.max(0, other ?? 0))
}
function dragFadeMs(clip, edge, startMs, deltaPx, msPerPx) {
    const dragged = deltaPx * msPerPx * (edge === "in" ? 1 : -1)
    return Math.round(Math.min(maxFadeMs(clip, edge), Math.max(0, startMs + dragged)))
}
function keyFadeMs(clip, edge, key, shift) {
    const current = (edge === "in" ? clip.fadeInMs : clip.fadeOutMs) ?? 0
    if (key !== "ArrowLeft" && key !== "ArrowRight") return current
    const delta = (key === "ArrowRight" ? 1 : -1) * (edge === "in" ? 1 : -1) * (shift ? 10 : 100)
    return Math.min(maxFadeMs(clip, edge), Math.max(0, current + delta))
}

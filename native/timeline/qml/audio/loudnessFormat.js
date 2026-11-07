.pragma library

// Delivery standards the meter judges the integrated loudness and the true peak against.
var standards = [
    {value: "none", label: "No standard", lufs: null, peak: null},
    {value: "broadcast", label: "Broadcast, -23 LUFS", lufs: -23, peak: -1},
    {value: "online", label: "Online video, -16 LUFS", lufs: -16, peak: -1},
    {value: "streaming", label: "Music streaming, -14 LUFS", lufs: -14, peak: -1}
]

function standard(value) {
    for (var i = 0; i < standards.length; ++i) { if (standards[i].value === value) { return standards[i] } }
    return standards[0]
}

// "-23.4", or "--" when there is no reading (silence, or nothing played yet).
function level(value) {
    return typeof value === "number" && isFinite(value) ? value.toFixed(1) : "--"
}

// How the integrated loudness sits against a standard: {status, text}. Status is "none", "ok", "near" or "off".
function judgeLoudness(integrated, target) {
    if (target === null || typeof integrated !== "number" || !isFinite(integrated)) { return {status: "none", text: ""} }
    var diff = integrated - target
    if (Math.abs(diff) <= 1) { return {status: "ok", text: "On target"} }
    var text = Math.abs(diff).toFixed(1) + " LU " + (diff > 0 ? "too loud" : "too quiet")
    return {status: Math.abs(diff) <= 2 ? "near" : "off", text: text}
}

function judgePeak(truePeak, limit) {
    if (limit === null || typeof truePeak !== "number" || !isFinite(truePeak)) { return {status: "none", text: ""} }
    return truePeak > limit ? {status: "off", text: "Over " + limit + " dBTP"} : {status: "ok", text: ""}
}

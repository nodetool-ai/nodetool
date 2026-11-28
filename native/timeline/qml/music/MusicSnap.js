.pragma library
// The Smart snap step of the Music toolbar (the contract's smartSnapTicks, LP21)
// and the conversions from this timeline's zoom and tempo to ticks. A tick is
// 1/960 of a quarter note. The step is the finest candidate that keeps its
// lines at least 16 px apart.

const ticksPerQuarter = 960
const minStepPx = 16

// candidates: the bar, the beat, then 480, 240 and 120 ticks; the smallest one
// whose spacing reaches minStepPx wins, and a view too far out takes the bar.
function smartSnapTicks(pxPerTick, beatTicks, beatsPerBar) {
    const bar = beatTicks * beatsPerBar
    const candidates = []
    for (const value of [bar, beatTicks, 480, 240, 120]) {
        if (candidates.indexOf(value) < 0) candidates.push(value)
    }
    candidates.sort((a, b) => b - a)
    let best = bar
    for (const candidate of candidates) {
        if (candidate * pxPerTick >= minStepPx) best = candidate
    }
    return best
}

// Pixels per tick from the view's ms per pixel and the tempo's BPM (quarter notes).
function pxPerTick(msPerPx, bpm) {
    if (!(msPerPx > 0) || !(bpm > 0)) return 0
    return (60000 / bpm / ticksPerQuarter) / msPerPx
}

function beatTicks(beatUnit) {
    return beatUnit > 0 ? ticksPerQuarter * 4 / beatUnit : ticksPerQuarter
}

// The smart step at a zoom and a tempo.
function smartStep(msPerPx, bpm, beatsPerBar, beatUnit) {
    return smartSnapTicks(pxPerTick(msPerPx, bpm), beatTicks(beatUnit), beatsPerBar > 0 ? beatsPerBar : 4)
}

// The grid division that names a step in ticks, for the ruler and the range tool.
function divisionFor(ticks, beatsPerBar, beatUnit) {
    const beat = beatTicks(beatUnit)
    if (ticks >= beat * (beatsPerBar > 0 ? beatsPerBar : 4)) return "bar"
    if (ticks === beat) return "beat"
    if (ticks === 480) return "1/8"
    if (ticks === 240) return "1/16"
    if (ticks === 120) return "1/32"
    return "beat"
}

// The snap select: Smart first, then the grid divisions the ruler offers.
const options = [
    {label: "Smart", value: "smart"}, {label: "Bar", value: "bar"}, {label: "Beat", value: "beat"},
    {label: "1/4", value: "1/4"}, {label: "1/8", value: "1/8"}, {label: "1/16", value: "1/16"},
    {label: "1/32", value: "1/32"}, {label: "1/8T", value: "1/8T"}, {label: "1/16T", value: "1/16T"}
]

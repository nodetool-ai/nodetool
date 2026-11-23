.pragma library
// Pure Step Editor rules. Keep parity with packages/timeline/src/midi/stepEditor.ts.
var GM_DRUM_LANES = [
    { pitch: 36, name: "Kick" },
    { pitch: 38, name: "Snare" },
    { pitch: 40, name: "Snare 2" },
    { pitch: 37, name: "Side Stick" },
    { pitch: 39, name: "Clap" },
    { pitch: 42, name: "Closed Hi-Hat" },
    { pitch: 44, name: "Pedal Hi-Hat" },
    { pitch: 46, name: "Open Hi-Hat" },
    { pitch: 41, name: "Low Tom" },
    { pitch: 45, name: "Mid Tom" },
    { pitch: 48, name: "High Tom" },
    { pitch: 49, name: "Crash" },
    { pitch: 51, name: "Ride" },
    { pitch: 53, name: "Ride Bell" },
    { pitch: 54, name: "Tambourine" },
    { pitch: 56, name: "Cowbell" }
];
function automaticLanes(notes, controllers) {
    const pitches = [...new Set(notes.map((n) => n.pitch))].sort((a, b) => b - a);
    return [
        ...pitches.map((pitch) => ({ type: "note", pitch })),
        ...(controllers ?? []).map((lane) => ({ type: "controller", laneId: lane.id }))
    ];
}
function valueFromY(y, height, min, max) {
    const raw = Math.round(min + (1 - y / height) * (max - min));
    const clamped = Math.min(max, Math.max(min, raw));
    return clamped === 0 ? 0 : clamped;
}
function stepStartTick(tick, step, phase) {
    return phase + Math.floor((tick - phase) / step) * step;
}
function drawStep(points, stepStart, step, value, newId) {
    let hit = -1;
    points.forEach((p, i) => {
        if (p.tick < stepStart || p.tick >= stepStart + step)
            return;
        if (hit < 0 || p.tick < points[hit].tick)
            hit = i;
    });
    const next = hit >= 0
        ? points.map((p, i) => (i === hit ? Object.assign({}, p, { value: value }) : Object.assign({}, p)))
        : [...points.map((p) => (Object.assign({}, p))), { id: newId(), tick: stepStart, value }];
    return next
        .map((p, i) => ({ p, i }))
        .sort((a, b) => a.p.tick - b.p.tick || a.i - b.i)
        .map((x) => x.p);
}
function drawNoteStep(notes, pitch, stepStart, step, velocity, length, newId) {
    const v = Math.min(127, Math.max(1, Math.round(velocity)));
    let hit = -1;
    notes.forEach((n, i) => {
        if (n.pitch !== pitch)
            return;
        if (n.startTick < stepStart || n.startTick >= stepStart + step)
            return;
        if (hit < 0 || n.startTick < notes[hit].startTick)
            hit = i;
    });
    if (hit >= 0)
        return notes.map((n, i) => (i === hit ? Object.assign({}, n, { velocity: v }) : n));
    return [
        ...notes,
        {
            id: newId(),
            pitch,
            startTick: stepStart,
            durationTick: length,
            velocity: v,
            channel: 0
        }
    ];
}
function lineSteps(t0, v0, t1, v1, step, phase) {
    const first = stepStartTick(Math.min(t0, t1), step, phase);
    const last = stepStartTick(Math.max(t0, t1), step, phase);
    const out = [];
    for (let s = first; s <= last; s += step) {
        let value = v1;
        if (t0 !== t1) {
            const f = Math.min(1, Math.max(0, (s - t0) / (t1 - t0)));
            value = v0 + (v1 - v0) * f;
        }
        out.push({ tick: s, value: Math.round(value) });
    }
    return out;
}
function scaleValues(values, percent, min) {
    return values.map((v) => Math.round(min + ((v - min) * percent) / 100));
}
function thinOut(ids) {
    return ids.filter((_, i) => i % 2 === 1);
}

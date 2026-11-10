.pragma library

// A wheel shows three channel values as a puck and a lightness: a shift of all three, and a
// direction of 120 degree spaced channel axes. Red sits where a Rec. 709 vectorscope draws it, so
// pushing the puck toward a hue on the ring pushes the picture toward it on the vectorscope.
const RED_DEG = 103;
const AXES = [0, 120, 240].map(offset => (RED_DEG + offset) * Math.PI / 180);
const LIFT_SCALE = 0.25;

function normalized(kind, value) {
    return kind === "lift" ? value / LIFT_SCALE : Math.log2(Math.max(value, 1e-4));
}
function channelValue(kind, value) {
    return kind === "lift" ? value * LIFT_SCALE : Math.pow(2, value);
}
function rounded(value) {
    return Math.round(value * 10000) / 10000;
}
// [r, g, b] of the effect field `kind` ("lift", "gamma" or "gain") to {x, y, lightness}, each in
// about -1..1, with y up. This is the exact inverse of channels().
function wheel(kind, values) {
    const n = (values || []).length === 3 ? values.map(v => normalized(kind, v)) : [0, 0, 0];
    const lightness = (n[0] + n[1] + n[2]) / 3;
    let x = 0, y = 0;
    for (let c = 0; c < 3; ++c) {
        x += (n[c] - lightness) * Math.cos(AXES[c]);
        y += (n[c] - lightness) * Math.sin(AXES[c]);
    }
    return {x: x * 2 / 3, y: y * 2 / 3, lightness};
}
function channels(kind, x, y, lightness) {
    return AXES.map(axis => rounded(channelValue(kind, lightness + x * Math.cos(axis) + y * Math.sin(axis))));
}
function clampToDisc(x, y) {
    const r = Math.hypot(x, y);
    return r > 1 ? {x: x / r, y: y / r} : {x, y};
}
// The ring color at an angle in degrees, counter-clockwise from +x.
function ringColor(deg) {
    const hue = ((deg - RED_DEG) % 360 + 360) % 360;
    const channel = offset => {
        const k = (offset + hue / 30) % 12;
        const value = 0.55 - 0.405 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(value * 255).toString(16).padStart(2, "0");
    };
    return "#" + channel(0) + channel(8) + channel(4);
}
// Effect types of the panel's sections, in the order the chain keeps them.
const SECTION_TYPES = ["exposure", "liftGammaGain", "curves", "hueSatCurves", "vignette"];
// The index at which a new effect of a section type goes, so the chain follows the panel.
function insertionIndex(effects, type) {
    const order = SECTION_TYPES.indexOf(type);
    const later = effects.findIndex(effect => SECTION_TYPES.indexOf(effect.type) > order);
    return later < 0 ? effects.length : later;
}
// A new effect that changes nothing.
function identity(type, id) {
    switch (type) {
    case "liftGammaGain": return {id, type, enabled: true, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1]};
    case "curves": return {id, type, enabled: true, master: [{x: 0, y: 0}, {x: 1, y: 1}]};
    case "vignette": return {id, type, enabled: true, amount: 0, softness: 0.5, radius: 0.9};
    case "exposure": return {id, type, enabled: true, exposure: 0, rolloff: 0, whites: 0, blacks: 0};
    case "hueSatCurves": return {id, type, enabled: true};
    }
    return null;
}

function hex(r, g, b) {
    return "#" + [r, g, b].map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
}
// The color under a curve's input at t in 0..1, as plain hex: "hue" runs red through the spectrum
// back to red, "luma" black to white and "saturation" gray to full red.
function stripColor(kind, t) {
    if (kind === "luma")
        return hex(t, t, t);
    if (kind === "saturation")
        return hex(0.5 + 0.5 * t, 0.5 - 0.5 * t, 0.5 - 0.5 * t);
    const channel = offset => Math.max(0, Math.min(1, Math.abs(((t + offset) % 1) * 6 - 3) - 1));
    return hex(channel(0), channel(2 / 3), channel(1 / 3));
}

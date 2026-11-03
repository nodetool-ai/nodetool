.pragma library

const softVignette = {radius: 1.5, softness: 1, centerX: 0.5, centerY: 0.5, roundness: 0};

const effectLabels = [
    {value: "denoise", label: "Noise reduction"},
    {value: "stabilize", label: "Stabilization"},
    {value: "deflicker", label: "Deflicker"},
    {value: "deband", label: "Deband"},
    {value: "secondaryColor", label: "Secondary color"},
    {value: "exposure", label: "Exposure / highlights"},
    {value: "blur", label: "Blur"}, {value: "glow", label: "Glow"},
    {value: "dropShadow", label: "Drop shadow"}, {value: "vignette", label: "Vignette"},
    {value: "sharpen", label: "Sharpen"}, {value: "chromaKey", label: "Chroma key"},
    {value: "curves", label: "Curves"}, {value: "levels", label: "Levels"},
    {value: "liftGammaGain", label: "Lift / gamma / gain"}, {value: "grain", label: "Film grain"},
    {value: "pixelate", label: "Pixelate"}, {value: "posterize", label: "Posterize"},
    {value: "directionalBlur", label: "Directional blur"}, {value: "lensDistortion", label: "Lens distortion"}
];
// The Color panel creates and edits these grades. They stay in the catalog so a clip that has one
// still names and draws it, and Effect Controls lists it.
function gradedInColorPanel(type) {
    return ["color", "curves", "liftGammaGain", "vignette"].includes(type);
}
const addableEffects = effectLabels.filter(effect => !gradedInColorPanel(effect.value));
function makeEffect(type, id) {
    const base = {id, type, enabled: true};
    switch (type) {
    case "denoise": return Object.assign(base, {lumaStrength: 0, chromaStrength: 0, temporalStrength: 0, radius: 2});
    case "stabilize": return Object.assign(base, {strength: 1, windowMs: 500, maxZoom: 1.1});
    case "deflicker": return Object.assign(base, {strength: 1, windowMs: 500, maxCorrection: 1});
    case "deband": return Object.assign(base, {strength: 0, range: 16, threshold: 0.02, dither: 0.5});
    case "secondaryColor": return Object.assign(base, {hueCenter: 0, hueWidth: 180, hueSoftness: 15, rangeSoftness: 0.1, saturationMin: 0, saturationMax: 1, lightnessMin: 0, lightnessMax: 1, hueShift: 0, saturation: 1, lightness: 0});
    case "exposure": return Object.assign(base, {exposure: 0, rolloff: 0, whites: 0});
    case "blur": return Object.assign(base, {radius: 8});
    case "glow": return Object.assign(base, {radius: 8, intensity: 1});
    case "dropShadow": return Object.assign(base, {offsetX: 8, offsetY: 8, blur: 12, color: "#000000", opacity: 0.6});
    case "vignette": return Object.assign(base, {amount: 0.4, softness: 0.5});
    case "sharpen": return Object.assign(base, {amount: 0.5, radius: 1});
    case "chromaKey": return Object.assign(base, {color: "#00ff00", tolerance: 0.2, softness: 0.1, spill: 0.5});
    case "curves": return Object.assign(base, {master: [{x: 0, y: 0}, {x: 1, y: 1}]});
    case "levels": return Object.assign(base, {inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 1});
    case "liftGammaGain": return Object.assign(base, {lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1]});
    case "grain": return Object.assign(base, {amount: 0.25, size: 1, colorAmount: 0, roughness: 0.5, softness: 0.25, animate: true});
    case "pixelate": return Object.assign(base, {cellSize: 8});
    case "posterize": return Object.assign(base, {levels: 4});
    case "directionalBlur": return Object.assign(base, {radius: 8, angle: 0});
    case "lensDistortion": return Object.assign(base, {amount: 0.5});
    }
    return null;
}
function name(type) {
    return type === "color" ? "Color" : (effectLabels.find(item => item.value === type)?.label || type);
}
function known(type) {
    return ["denoise", "stabilize", "deflicker", "deband", "secondaryColor", "exposure", "color", "blur", "glow", "dropShadow", "vignette", "sharpen", "chromaKey", "curves", "levels", "liftGammaGain", "grain", "pixelate", "posterize", "directionalBlur", "lensDistortion", "stylize", "generator", "lut"].includes(type);
}
function readOnlyDescription(type) {
    switch (type) {
    case "stylize": return "This stylize effect is applied. Its mode parameters cannot be edited here yet. Imported settings are preserved.";
    case "generator": return "This generator is rendered. Its parameters cannot be edited here yet. Imported settings are preserved.";
    case "lut": return "This LUT is applied. Its color table cannot be replaced here yet. Imported settings are preserved.";
    default: return 'This build does not draw "' + type + '". Its settings are kept as written.';
    }
}
const colorFields = [
    {key: "brightness", label: "Brightness", min: -1, max: 1, origin: 0, step: 0.01},
    {key: "contrast", label: "Contrast", min: 0, max: 4, origin: 1, step: 0.01},
    {key: "saturation", label: "Saturation", min: 0, max: 4, origin: 1, step: 0.01},
    {key: "hue", label: "Hue", min: -180, max: 180, origin: 0, step: 1},
    {key: "temperature", label: "Temperature", min: -1, max: 1, origin: 0, step: 0.01},
    {key: "tint", label: "Tint", min: -1, max: 1, origin: 0, step: 0.01},
    {key: "shadows", label: "Shadows", min: -1, max: 1, origin: 0, step: 0.01},
    {key: "highlights", label: "Highlights", min: -1, max: 1, origin: 0, step: 0.01}
];
function slider(key, label, fallback, max = 1, min = 0, step = 0.01, extra = {}) {
    return Object.assign({kind: "slider", key, label, fallback, min, max, step, resetValue: fallback}, extra);
}
function number(key, label, fallback, minimum, step = 1, extra = {}) {
    return Object.assign({kind: "number", key, label, fallback, minimum, step}, extra);
}
// A field with a stopwatch in Effect Controls. These settings are read only when the analysis runs,
// and they are part of what the stored analysis has to match.
const analysisFields = {stabilize: ["windowMs"], deflicker: ["windowMs", "maxCorrection"]};
function keyed(type, field) {
    if (gradedInColorPanel(type)) {
        return false;
    }
    if (field.kind === "offset") {
        return true;
    }
    return (field.kind === "slider" || field.kind === "number") && (analysisFields[type] || []).indexOf(field.key) < 0;
}
// The rows of one effect, in the shape the panel's fixed rows have. The row id is the curve's name,
// and nt::keyframes::effectParamSpec holds the same bounds for the edits.
function keyedRows(effectId, type, mediaType) {
    const rowOf = (key, label, input) => ({id: "effect:" + effectId + ":" + key, label: label, inputs: [Object.assign({label: name(type) + " " + label}, input)]});
    const rows = [];
    for (const field of fields(type)) {
        if (!keyed(type, field) || (field.videoOnly && mediaType !== "video")) {
            continue;
        }
        if (field.kind === "offset") {
            rows.push(rowOf("offsetX", "Offset X", {unit: "px", decimals: 0, step: 1}));
            rows.push(rowOf("offsetY", "Offset Y", {unit: "px", decimals: 0, step: 1}));
        } else if (field.kind === "number") {
            const gamma = field.key === "gamma";
            rows.push(rowOf(field.key, field.label, {unit: gamma ? "" : "px", decimals: gamma ? 2 : 0, step: field.step, min: gamma ? 0.01 : field.minimum}));
        } else {
            rows.push(rowOf(field.key, field.label, {unit: field.unit || "", decimals: field.decimals ?? 2, step: field.step, min: field.min, max: field.max}));
        }
    }
    return rows;
}
function fields(type) {
    switch (type) {
    case "denoise": return [slider("lumaStrength", "Luminance", 0), slider("chromaStrength", "Chroma", 0),
        slider("temporalStrength", "Temporal", 0, 1, 0, 0.01, {videoOnly: true}),
        slider("radius", "Spatial radius", 2, 4, 1, 1, {unit: "px", decimals: 0})];
    case "stabilize": return [slider("strength", "Strength", 1),
        slider("windowMs", "Smoothing window", 500, 2000, 0, 50, {unit: "ms", decimals: 0}),
        slider("maxZoom", "Maximum zoom", 1.1, 1.5, 1, 0.01, {unit: "x", decimals: 2})];
    case "deflicker": return [slider("strength", "Strength", 1),
        slider("windowMs", "Analysis window", 500, 2000, 0, 50, {unit: "ms", decimals: 0}),
        slider("maxCorrection", "Correction limit", 1, 3, 0, 0.1, {unit: "stops", decimals: 1})];
    case "deband": return [slider("strength", "Strength", 0), slider("range", "Range", 16, 64, 1, 1, {unit: "px", decimals: 0}),
        slider("threshold", "Threshold", 0.02, 0.1, 0, 0.001, {decimals: 3}), slider("dither", "Dither", 0.5)];
    case "secondaryColor": return [
        slider("hueCenter", "Hue center", 0, 360, 0, 1, {unit: "°", decimals: 0}),
        slider("hueWidth", "Hue half-width", 180, 180, 0, 1, {unit: "°", decimals: 0}),
        slider("hueSoftness", "Hue softness", 15, 180, 0, 1, {unit: "°", decimals: 0}),
        slider("saturationMin", "Saturation low", 0), slider("saturationMax", "Saturation high", 1),
        slider("lightnessMin", "Lightness low", 0), slider("lightnessMax", "Lightness high", 1),
        slider("rangeSoftness", "Range softness", 0.1),
        slider("hueShift", "Hue shift", 0, 180, -180, 1, {unit: "°", decimals: 0}),
        slider("saturation", "Saturation", 1, 4), slider("lightness", "Lightness", 0, 1, -1)
    ];
    case "exposure": return [slider("exposure", "Exposure", 0, 5, -5, 0.1, {unit: "stops", decimals: 1}), slider("rolloff", "Highlight roll-off", 0), slider("whites", "Whites", 0, 2, -2, 0.1, {unit: "stops", decimals: 1})];
    case "color": return colorFields.map(field => Object.assign({kind: "slider", fallback: field.origin, resetValue: field.origin}, field));
    case "pixelate": return [slider("cellSize", "Cell size", 8, 128, 1, 1, {unit: "px", decimals: 0, resetValue: 1})];
    case "posterize": return [slider("levels", "Levels", 4, 256, 2, 1, {decimals: 0, resetValue: 256})];
    case "directionalBlur": return [slider("radius", "Radius", 8, 256, 0, 0.5, {unit: "px", decimals: 1, resetValue: 0}), slider("angle", "Angle", 0, 180, -180, 1, {unit: "°", decimals: 0})];
    case "lensDistortion": return [slider("amount", "Amount", 0.5, 1, -1, 0.01, {origin: 0, resetValue: 0})];
    case "blur": return [slider("radius", "Radius", 8, 20, 0, 0.5, {unit: "px", decimals: 1, resetValue: 0})];
    case "glow": return [number("radius", "Radius", 8, 0), slider("intensity", "Intensity", 1, 2, 0, 0.01, {resetValue: 0}), {kind: "color", key: "color", label: "Color", fallback: "#ffffff"}];
    case "dropShadow": return [
        {kind: "offset", label: "Offset"}, number("blur", "Blur", 12, 0),
        {kind: "color", key: "color", label: "Color", fallback: "#000000"},
        slider("opacity", "Opacity", 1, 1, 0, 0.01, {resetValue: 1})
    ];
    case "vignette": return [slider("amount", "Amount", 0.4, 1, 0, 0.01, {resetValue: 0}), slider("radius", "Radius", 0.9, 1.5, 0.1, 0.01, {resetValue: 0.9}), slider("softness", "Softness", 0.5), slider("centerX", "Center X", 0.5), slider("centerY", "Center Y", 0.5), slider("roundness", "Roundness", 0)];
    case "sharpen": return [slider("amount", "Amount", 0.5, 2, 0, 0.01, {resetValue: 0}), number("radius", "Radius", 1, 0)];
    case "chromaKey": return [{kind: "color", key: "color", label: "Key color", fallback: "#00ff00"}, slider("tolerance", "Tolerance", 0.2), slider("softness", "Softness", 0.1), slider("spill", "Spill", 0.5)];
    case "levels": return [slider("inBlack", "In black", 0), slider("inWhite", "In white", 1), number("gamma", "Gamma", 1, 0, 0.01, {exclusiveMin: true}), slider("outBlack", "Out black", 0), slider("outWhite", "Out white", 1)];
    case "liftGammaGain": return [{kind: "triple", key: "lift", label: "Lift"}, {kind: "triple", key: "gamma", label: "Gamma"}, {kind: "triple", key: "gain", label: "Gain"}];
    case "grain": return [slider("amount", "Amount", 0.25, 1, 0, 0.01, {resetValue: 0}), slider("size", "Size", 1, 16, 1, 0.5, {unit: "px", decimals: 1}), slider("roughness", "Roughness", 0.5), slider("softness", "Softness", 0.25), slider("colorAmount", "Color", 0, 1, 0, 0.01, {origin: 0}), {kind: "toggle", key: "animate", label: "Animate", fallback: false}];
    default: return [];
    }
}

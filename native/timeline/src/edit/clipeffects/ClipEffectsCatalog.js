.pragma library

const addableEffects = [
    {value: "blur", label: "Blur"}, {value: "glow", label: "Glow"},
    {value: "dropShadow", label: "Drop shadow"}, {value: "vignette", label: "Vignette"},
    {value: "sharpen", label: "Sharpen"}, {value: "chromaKey", label: "Chroma key"},
    {value: "curves", label: "Curves"}, {value: "levels", label: "Levels"},
    {value: "liftGammaGain", label: "Lift / gamma / gain"}, {value: "grain", label: "Film grain"}
];
function makeEffect(type, id) {
    const base = {id, type, enabled: true};
    switch (type) {
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
    }
    return null;
}
function name(type) {
    return type === "color" ? "Color" : (addableEffects.find(item => item.value === type)?.label || type);
}
function known(type) {
    return ["color", "blur", "glow", "dropShadow", "vignette", "sharpen", "chromaKey", "curves", "levels", "liftGammaGain", "grain", "pixelate", "posterize", "directionalBlur", "lensDistortion", "stylize", "generator", "lut"].includes(type);
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
    return Object.assign({kind: "slider", key, label, fallback, min, max, step}, extra);
}
function number(key, label, fallback, minimum, step = 1, extra = {}) {
    return Object.assign({kind: "number", key, label, fallback, minimum, step}, extra);
}
function fields(type) {
    switch (type) {
    case "blur": return [slider("radius", "Radius", 8, 20, 0, 0.5, {unit: "px", decimals: 1})];
    case "glow": return [number("radius", "Radius", 8, 0), slider("intensity", "Intensity", 1, 2), {kind: "color", key: "color", label: "Color", fallback: "#ffffff"}];
    case "dropShadow": return [
        {kind: "offset", label: "Offset"}, number("blur", "Blur", 12, 0),
        {kind: "color", key: "color", label: "Color", fallback: "#000000"},
        slider("opacity", "Opacity", 1, 1, 0, 0.01, {resetValue: 1})
    ];
    case "vignette": return [slider("amount", "Amount", 0.4), slider("softness", "Softness", 0.5)];
    case "sharpen": return [slider("amount", "Amount", 0.5, 2), number("radius", "Radius", 1, 0)];
    case "chromaKey": return [{kind: "color", key: "color", label: "Key color", fallback: "#00ff00"}, slider("tolerance", "Tolerance", 0.2), slider("softness", "Softness", 0.1), slider("spill", "Spill", 0.5)];
    case "levels": return [slider("inBlack", "In black", 0), slider("inWhite", "In white", 1), number("gamma", "Gamma", 1, 0, 0.01, {exclusiveMin: true}), slider("outBlack", "Out black", 0), slider("outWhite", "Out white", 1)];
    case "liftGammaGain": return [{kind: "triple", key: "lift", label: "Lift"}, {kind: "triple", key: "gamma", label: "Gamma"}, {kind: "triple", key: "gain", label: "Gain"}];
    case "grain": return [slider("amount", "Amount", 0.25), slider("size", "Size", 1, 16, 1, 0.5, {unit: "px", decimals: 1}), slider("roughness", "Roughness", 0.5), slider("softness", "Softness", 0.25), slider("colorAmount", "Color", 0, 1, 0, 0.01, {origin: 0}), {kind: "toggle", key: "animate", label: "Animate", fallback: false}];
    default: return [];
    }
}

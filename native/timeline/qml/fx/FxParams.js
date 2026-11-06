.pragma library

// fablesynth/params.ts: ParamDef {id,label,min,max,def,curve,fmt,type,options}.
function normToValue(def, n) {
    n = Math.min(1, Math.max(0, n))
    if (def.curve === "log") return def.min * Math.pow(def.max / def.min, n)
    var v = def.min + (def.max - def.min) * n
    return def.curve === "int" ? Math.round(v) : v
}
function valueToNorm(def, v) {
    if (def.curve === "log") return Math.log(v / def.min) / Math.log(def.max / def.min)
    return (v - def.min) / (def.max - def.min)
}
function fmtHz(v) { return v >= 1000 ? (v / 1000).toFixed(2) + " kHz" : v.toFixed(v < 100 ? 1 : 0) + " Hz" }
function fmtSec(v) { return v < 1 ? (v * 1000).toFixed(0) + " ms" : v.toFixed(2) + " s" }
function fmtPct(v) { return Math.round(v * 100) + "%" }
function fmtPan(v) { return Math.abs(v) < 0.01 ? "C" : v < 0 ? Math.round(-v * 100) + "L" : Math.round(v * 100) + "R" }
function fmtSigned(v) { return (v > 0 ? "+" : "") + Math.round(v) }
function fmtDb(v) { return (v > 0 ? "+" : "") + v.toFixed(1) + " dB" }
function fmtBi(v) { return (v > 0 ? "+" : "") + Math.round(v * 100) }
function fmtNote(v) {
    var n = Math.round(v)
    return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1)
}

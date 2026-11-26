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
function fmtRatio(v) { return v.toFixed(1) + ":1" }
function fmtAttack(v) { return v < 0.01 ? (v * 1000).toFixed(1) + " ms" : fmtSec(v) }
function fmtGainDb(v) { return "+" + v.toFixed(1) + " dB" }
function fmtPlainDb(v) { return v.toFixed(1) + " dB" }
function fmtIntDb(v) { return Math.round(v) + " dB" }
function fmtQ(v) { return v.toFixed(2) }
function fmtIntHz(v) { return Math.round(v) + " Hz" }
function fmtRateHz(v) { return v.toFixed(2) + " Hz" }
function fmtDriveTone(v) { return v === 0 ? "NEUTRAL" : Math.round(Math.abs(v) * 100) + "% " + (v < 0 ? "DARK" : "BRIGHT") }

var EQ_TYPES = ["LOW SHELF", "BELL", "HIGH SHELF"]
var DRIVE_TYPES = ["SOFT", "TAPE", "HARD"]
var ECHO_MODES = ["PING PONG", "STEREO"]
var ECHO_DIVS = ["1/4", "1/4.", "1/8", "1/8.", "1/8T", "1/16"]
var REVERB_TYPES = ["ROOM", "PLATE"]

var FABLE_FX_PARAMS = {
    eq: [
        { id: "fx.eq.low", label: "LOW", min: -15, max: 15, def: 0, curve: "lin", fmt: fmtDb },
        { id: "fx.eq.mid", label: "MID", min: -15, max: 15, def: 0, curve: "lin", fmt: fmtDb },
        { id: "fx.eq.mfreq", label: "FREQ", min: 20, max: 20000, def: 900, curve: "log", fmt: fmtHz },
        { id: "fx.eq.high", label: "HIGH", min: -15, max: 15, def: 0, curve: "lin", fmt: fmtDb },
        { id: "fx.eq.lfreq", label: "FREQ", min: 20, max: 20000, def: 120, curve: "log", fmt: fmtHz },
        { id: "fx.eq.m2freq", label: "FREQ", min: 20, max: 20000, def: 2500, curve: "log", fmt: fmtHz },
        { id: "fx.eq.hfreq", label: "FREQ", min: 20, max: 20000, def: 6000, curve: "log", fmt: fmtHz },
        { id: "fx.eq.mid2", label: "GAIN", min: -15, max: 15, def: 0, curve: "lin", fmt: fmtDb },
        { id: "fx.eq.lq", label: "Q", min: 0.2, max: 12, def: Math.SQRT1_2, curve: "log", fmt: fmtQ },
        { id: "fx.eq.ltype", type: "enum", options: EQ_TYPES, def: 0 },
        { id: "fx.eq.lon", type: "bool", def: 1 },
        { id: "fx.eq.mq", label: "Q", min: 0.2, max: 12, def: 0.9, curve: "log", fmt: fmtQ },
        { id: "fx.eq.mtype", type: "enum", options: EQ_TYPES, def: 1 },
        { id: "fx.eq.mon", type: "bool", def: 1 },
        { id: "fx.eq.m2q", label: "Q", min: 0.2, max: 12, def: 0.9, curve: "log", fmt: fmtQ },
        { id: "fx.eq.m2type", type: "enum", options: EQ_TYPES, def: 1 },
        { id: "fx.eq.m2on", type: "bool", def: 1 },
        { id: "fx.eq.hq", label: "Q", min: 0.2, max: 12, def: Math.SQRT1_2, curve: "log", fmt: fmtQ },
        { id: "fx.eq.htype", type: "enum", options: EQ_TYPES, def: 2 },
        { id: "fx.eq.hon", type: "bool", def: 1 }
    ],
    comp: [
        { id: "fx.comp.thr", label: "THRESH", min: -40, max: 0, def: -18, curve: "lin", fmt: fmtIntDb },
        { id: "fx.comp.att", label: "ATTACK", min: 0.0001, max: 0.1, def: 0.003, curve: "log", fmt: fmtAttack },
        { id: "fx.comp.rel", label: "RELEASE", min: 0.01, max: 2, def: 0.25, curve: "log", fmt: fmtSec },
        { id: "fx.comp.ratio", label: "RATIO", min: 1, max: 20, def: 4, curve: "log", fmt: fmtRatio },
        { id: "fx.comp.schp", label: "KEY HP", min: 20, max: 500, def: 20, curve: "log", fmt: fmtIntHz }
    ],
    ott: [
        { id: "fx.ott.depth", label: "DEPTH", min: 0, max: 1, def: 0.35, curve: "lin", fmt: fmtPct },
        { id: "fx.ott.time", label: "TIME", min: 0.01, max: 10, def: 1, curve: "log", fmt: fmtPct },
        { id: "fx.ott.up", label: "UPWARD", min: 0, max: 2, def: 1, curve: "lin", fmt: fmtPct },
        { id: "fx.ott.down", label: "DOWNWARD", min: 0, max: 2, def: 1, curve: "lin", fmt: fmtPct }
    ],
    limiter: [
        { id: "fx.limit.gain", label: "INPUT", min: 0, max: 24, def: 0, curve: "lin", fmt: fmtGainDb },
        { id: "fx.limit.ceil", label: "CEILING", min: -12, max: 0, def: -1, curve: "lin", fmt: fmtPlainDb },
        { id: "fx.limit.rel", label: "RELEASE", min: 0.01, max: 1, def: 0.1, curve: "log", fmt: fmtSec }
    ],
    drive: [
        { id: "fx.drive.amt", label: "AMOUNT", min: 0, max: 1, def: 0.3, curve: "lin", fmt: fmtPct },
        { id: "fx.drive.mix", label: "MIX", min: 0, max: 1, def: 1, curve: "lin", fmt: fmtPct },
        { id: "fx.drive.tone", label: "TONE", min: -1, max: 1, def: 0, curve: "lin", fmt: fmtDriveTone },
        { id: "fx.drive.type", type: "enum", options: DRIVE_TYPES, def: 0 }
    ],
    chorus: [
        { id: "fx.chorus.rate", label: "RATE", min: 0.05, max: 8, def: 0.6, curve: "log", fmt: fmtRateHz },
        { id: "fx.chorus.depth", label: "DEPTH", min: 0, max: 1, def: 0.5, curve: "lin", fmt: fmtPct },
        { id: "fx.chorus.mix", label: "MIX", min: 0, max: 1, def: 0.5, curve: "lin", fmt: fmtPct }
    ],
    echo: [
        { id: "fx.delay.time", label: "TIME", min: 0.02, max: 1.5, def: 0.36, curve: "log", fmt: fmtSec },
        { id: "fx.delay.fb", label: "FDBK", min: 0, max: 0.92, def: 0.35, curve: "lin", fmt: fmtPct },
        { id: "fx.delay.mix", label: "MIX", min: 0, max: 1, def: 0.3, curve: "lin", fmt: fmtPct },
        { id: "fx.delay.tone", label: "TONE", min: 400, max: 12000, def: 4500, curve: "log", fmt: fmtHz },
        { id: "fx.delay.sat", label: "SAT", min: 0, max: 1, def: 0.2, curve: "lin", fmt: fmtPct },
        { id: "fx.delay.wow", label: "WOW", min: 0, max: 1, def: 0.18, curve: "lin", fmt: fmtPct },
        { id: "fx.delay.flutter", label: "FLUTTER", min: 0, max: 1, def: 0.12, curve: "lin", fmt: fmtPct },
        { id: "fx.delay.width", label: "WIDTH", min: 0, max: 1, def: 1, curve: "lin", fmt: fmtPct },
        { id: "fx.delay.mode", type: "enum", options: ECHO_MODES, def: 0 },
        { id: "fx.delay.sync", type: "bool", def: 0 },
        { id: "fx.delay.div", type: "enum", options: ECHO_DIVS, def: 3 }
    ],
    reverb: [
        { id: "fx.reverb.size", label: "SIZE", min: 0, max: 1, def: 0.5, curve: "lin", fmt: fmtPct },
        { id: "fx.reverb.mix", label: "MIX", min: 0, max: 1, def: 0.3, curve: "lin", fmt: fmtPct },
        { id: "fx.reverb.type", type: "enum", options: REVERB_TYPES, def: 0 },
        { id: "fx.reverb.damp", label: "DAMP", min: 0, max: 1, def: 0.5, curve: "lin", fmt: fmtPct }
    ]
}

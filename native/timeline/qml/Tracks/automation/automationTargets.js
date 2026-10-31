.pragma library
function key(target) {
    return target.kind === "clip" ? "clip:" + target.property : target.kind === "device"
        ? "device:" + target.deviceId + ":" + target.param : "mixer:" + target.param
}
function spec(target, label, group, min, max, value, curve) {
    return {target: target, key: key(target), label: label, group: group,
        min: min, max: max, value: value === undefined ? min : value, curve: curve || "lin"}
}
var EFFECT_LABELS = {gain:"Gain", eq3:"3-Band EQ", filter:"Filter", compressor:"Compressor"}
function automationTargetSpecs(track) {
    var result = []
    if (track.type === "audio" || track.type === "midi") {
        result.push(spec({kind:"mixer", param:"volumeDb"}, "Volume", "Mixer", -60, 6, track.volumeDb || 0))
        result.push(spec({kind:"mixer", param:"pan"}, "Pan", "Mixer", -1, 1, track.pan || 0))
        var freq = [20, 20000, "log"]
        var fields = {
            gain: [["gainDb", "Gain", -24, 24]],
            eq3: [["lowFreq", "Low freq"].concat(freq), ["lowGainDb", "Low gain", -24, 24],
                ["midFreq", "Mid freq"].concat(freq), ["midQ", "Mid Q", .1, 18], ["midGainDb", "Mid gain", -24, 24],
                ["highFreq", "High freq"].concat(freq), ["highGainDb", "High gain", -24, 24]],
            filter: [["frequency", "Frequency"].concat(freq), ["q", "Q", .1, 20]],
            compressor: [["thresholdDb", "Threshold", -60, 0], ["ratio", "Ratio", 1, 20],
                ["attackMs", "Attack", 0, 500], ["releaseMs", "Release", 0, 2000], ["kneeDb", "Knee", 0, 40]]
        }
        ;(track.effects || []).forEach(function(effect, index) {
            ;(fields[effect.type] || []).forEach(function(field) {
                result.push(spec({kind:"device", deviceId:effect.id, param:field[0]}, field[1],
                    (index + 1) + ". " + EFFECT_LABELS[effect.type], field[2], field[3], effect[field[0]], field[4]))
            })
        })
    } else if (track.type === "video" || track.type === "overlay") {
        var picture = [["opacity","Opacity",0,1,1], ["scale","Scale",0,4,1], ["offsetX","Position X",-2000,2000,0],
            ["offsetY","Position Y",-2000,2000,0], ["rotation","Rotation",-2*Math.PI,2*Math.PI,0],
            ["brightness","Brightness",-1,1,0], ["contrast","Contrast",0,2,1], ["saturation","Saturation",0,2,1],
            ["hue","Hue",-180,180,0], ["blur","Blur",0,40,0]]
        result = picture.map(f => spec({kind:"clip",property:f[0]}, f[1], "Clips on this track", f[2], f[3], f[4]))
    }
    return result
}
function automationTargetSpec(track, target) {
    var targetKey = key(target)
    return automationTargetSpecs(track).find(s => s.key === targetKey) || null
}
function automationValueToNorm(spec, value) {
    var v = Math.min(spec.max, Math.max(spec.min, value))
    return spec.curve === "log" && spec.min > 0 ? Math.log(v/spec.min)/Math.log(spec.max/spec.min)
        : spec.max === spec.min ? 0 : (v-spec.min)/(spec.max-spec.min)
}
function automationNormToValue(spec, norm) {
    var n = Math.min(1, Math.max(0, norm))
    return spec.curve === "log" && spec.min > 0 ? spec.min*Math.pow(spec.max/spec.min,n) : spec.min+(spec.max-spec.min)*n
}
function format(spec, value) {
    var p = spec.target.param || spec.target.property
    if (p === "pan") return Math.abs(value)<.01 ? "C" : Math.round(Math.abs(value)*100)+(value<0?"L":"R")
    if (/Db$/.test(p)) return (value>0?"+":"")+value.toFixed(1)+" dB"
    if (/frequency|Freq/.test(p)) return value>=1000 ? (value/1000).toFixed(2)+" kHz" : value.toFixed(value<100?1:0)+" Hz"
    if (/Ms$/.test(p)) return Math.round(value)+" ms"
    if (p === "ratio") return value.toFixed(1)+":1"
    if (p === "opacity") return Math.round(value*100)+"%"
    if (p === "rotation") return (value*180/Math.PI).toFixed(1)+"°"
    return value.toFixed(2)
}

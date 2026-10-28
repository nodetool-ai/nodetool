.pragma library
function peak(samples) {
    var peak=0
    for(var i=0;i<samples.length;i++)peak=Math.max(peak,Math.abs(samples[i]))
    return peak
}
function db(peak) { return peak>0 ? 20*Math.log(peak)/Math.LN10 : -120 }

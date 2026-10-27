.pragma library
var FADER_MAX_DB = 6
var FADER_MIN_DB = -120
var MIXER_MAX_DB = 24
var TAPER = [[0,-120],[.04,-72],[.12,-48],[.25,-30],[.42,-18],[.6,-9],[.78,-3],[.86,0],[1,6]]
var FADER_MARKS = [[0,"0"],[-120,"∞"],[-12,"-12"],[6,"+6"],[-24,"-24"],[-48,"-48"],[-6,"-6"]]
function dbToFaderPosition(db) {
    if(!Number.isFinite(db)||db<=-120)return 0
    if(db>=6)return 1
    for(var i=1;i<TAPER.length;i++)if(db<=TAPER[i][1]) {
        var a=TAPER[i-1],b=TAPER[i]
        return a[0]+(db-a[1])/(b[1]-a[1])*(b[0]-a[0])
    }
    return 1
}
function faderPositionToDb(position) {
    if(!(position>0))return -120
    if(position>=1)return 6
    for(var i=1;i<TAPER.length;i++)if(position<=TAPER[i][0]) {
        var a=TAPER[i-1],b=TAPER[i]
        return Math.round((a[1]+(position-a[0])/(b[0]-a[0])*(b[1]-a[1]))*10)/10
    }
    return 6
}
function formatDb(db) {
    var value=db === undefined ? 0 : db
    if(value<=-120)return "-inf dB"
    var rounded=Math.round(value*10)/10
    return (rounded>0?"+":"")+rounded.toFixed(1)+" dB"
}
function parseDb(text) {
    var t=text.trim().toLowerCase().replace(/\s*db$/, "").replace("−","-")
    if(["-inf","inf","-∞","∞"].includes(t))return -120
    if(t==="")return null
    var v=Number(t)
    return Number.isFinite(v)?Math.min(24,Math.max(-120,v)):null
}
function formatPan(pan) {
    var amount=Math.round(Math.abs(pan || 0)*100)
    return amount===0 ? "C" : ((pan || 0)<0 ? "L " : "R ")+amount
}
function panValueText(pan) {
    var amount=Math.round(Math.abs(pan)*100)
    return amount===0?"Centre":amount+"% "+(pan<0?"left":"right")
}

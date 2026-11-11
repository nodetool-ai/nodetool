.pragma library
function clamp(v,a,b) { return Math.max(a,Math.min(b,v)) }
function freqToX(f,w) { return Math.log(f/20)/Math.log(1000)*w }
function xToFreq(x,w) { return 20*Math.pow(1000,x/w) }
function dbToY(db,h) { return h/2-db/18*h/2 }
function yToDb(y,h) { return (h/2-y)/(h/2)*18 }
function biquadMagDb(type,f,f0,gainDb,q) {
    if(gainDb===0)return 0
    var A=Math.pow(10,gainDb/40), w0=2*Math.PI*f0/48000, c=Math.cos(w0), s=Math.sin(w0)
    var b0=1,b1=0,b2=0,a0=1,a1=0,a2=0
    if(type==="peaking") {
        var alpha=s/(2*q)
        b0=1+alpha*A; b1=-2*c; b2=1-alpha*A; a0=1+alpha/A; a1=-2*c; a2=1-alpha/A
    } else {
        var t=2*Math.sqrt(A)*(s/2*Math.sqrt(2))
        if(type==="lowshelf") {
            b0=A*(A+1-(A-1)*c+t); b1=2*A*(A-1-(A+1)*c); b2=A*(A+1-(A-1)*c-t)
            a0=A+1+(A-1)*c+t; a1=-2*(A-1+(A+1)*c); a2=A+1+(A-1)*c-t
        } else {
            b0=A*(A+1+(A-1)*c+t); b1=-2*A*(A-1+(A+1)*c); b2=A*(A+1+(A-1)*c-t)
            a0=A+1-(A-1)*c+t; a1=2*(A-1-(A+1)*c); a2=A+1-(A-1)*c-t
        }
    }
    var w=2*Math.PI*f/48000,c1=Math.cos(w),s1=Math.sin(w),c2=Math.cos(2*w),s2=Math.sin(2*w)
    var nr=b0+b1*c1+b2*c2,ni=-(b1*s1+b2*s2),dr=a0+a1*c1+a2*c2,di=-(a1*s1+a2*s2)
    var den=dr*dr+di*di
    return den===0?0:10*Math.log10((nr*nr+ni*ni)/den)
}
function eqMagnitude(effect,f) {
    return biquadMagDb("lowshelf",f,effect.lowFreq,effect.lowGainDb,.7)
        +biquadMagDb("peaking",f,effect.midFreq,effect.midGainDb,effect.midQ)
        +biquadMagDb("highshelf",f,effect.highFreq,effect.highGainDb,.7)
}
function compTransferDb(input,threshold,ratio,knee) {
    var half=knee/2,delta=input-threshold
    if(knee>0 && delta>-half && delta<half) { var x=delta+half; return input+(1/ratio-1)*x*x/(2*knee) }
    return delta<=0?input:threshold+delta/ratio
}
function compXY(db,size) { return (db+60)/60*size }
function compFromX(x,size) { return -60+x/size*60 }
function compFromY(y,size) { return -60+(size-y)/size*60 }

import QtQuick
import NodeTool.Timeline
import "effectCurves.js" as Curves
Rectangle {
    id: root
    property var effect: ({lowFreq:200,lowGainDb:0,midFreq:1000,midGainDb:0,midQ:1,highFreq:5000,highGainDb:0})
    property bool disabled: false
    property var draft: ({})
    readonly property var display: Object.assign({},effect,draft)
    signal preview(var patch)
    signal commit(var patch)
    objectName: "effect-curve-eq3"
    implicitHeight: 160; height: 160; radius: Theme.radiusSm; border.color: Theme.divider
    gradient: Gradient { GradientStop { position:0; color:Theme.backgroundPaper } GradientStop { position:1; color:Theme.scrimSoft } }
    function change(patch) { draft=Object.assign({},draft,patch); preview(draft) }
    function finish() { if(!Object.keys(draft).length)return; var p=draft; draft={}; commit(p) }
    function bandAt(band,x,y) {
        var ranges={low:[40,400],mid:[100,8000],high:[2000,16000]}, p={}
        p[band+"Freq"]=Curves.clamp(Curves.xToFreq(Curves.clamp(x,0,width),width),ranges[band][0],ranges[band][1])
        p[band+"GainDb"]=Curves.clamp(Curves.yToDb(Curves.clamp(y,0,height),height),-18,18)
        change(p)
    }
    Canvas {
        id: plot; anchors.fill: parent
        onPaint: {
            var ctx=getContext("2d"); ctx.reset(); ctx.font=Theme.fontSizeSmaller+"px '"+Theme.monoFamily+"'"
            ctx.strokeStyle=Theme.divider; ctx.fillStyle=Theme.textDisabled
            ;[-12,-6,0,6,12].forEach(function(db) {
                var y=Curves.dbToY(db,height); ctx.beginPath(); ctx.lineWidth=db===0?1:.5
                ctx.setLineDash(db===0?[]:[2,3]); ctx.moveTo(0,y); ctx.lineTo(width,y); ctx.stroke(); ctx.fillText((db>0?"+":"")+db,4,y-2)
            })
            ;[50,100,200,500,1000,2000,5000,10000].forEach(function(f) {
                var x=Curves.freqToX(f,width); ctx.beginPath(); ctx.lineWidth=.5; ctx.setLineDash([2,3]); ctx.moveTo(x,0); ctx.lineTo(x,height); ctx.stroke(); ctx.fillText(f>=1000?f/1000+"k":String(f),x+2,height-4)
            })
            ctx.setLineDash([]); ctx.beginPath()
            for(var i=0;i<=224;i++) { var x=i/224*width,y=Curves.dbToY(Curves.eqMagnitude(root.display,Curves.xToFreq(x,width)),height); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y) }
            ctx.strokeStyle=root.disabled?Theme.textDisabled:Qt.lighter(Theme.primary,1.3); ctx.lineWidth=1.75; ctx.stroke()
            ctx.lineTo(width,height/2); ctx.lineTo(0,height/2); ctx.closePath(); ctx.globalAlpha=root.disabled?.08:.18; ctx.fillStyle=Theme.primary; ctx.fill()
        }
        Connections { target:root; function onDisplayChanged() { plot.requestPaint() } function onDisabledChanged() { plot.requestPaint() } }
    }
    Timer { id: wheelEnd; interval:250; onTriggered:root.finish() }
    Repeater {
        model: ["low","mid","high"]
        delegate: Item {
            id: handle
            required property string modelData
            readonly property color accent: modelData==="low"?Theme.info:modelData==="mid"?Theme.success:Theme.warning
            objectName: "effect-handle-eq3-"+modelData
            x: Curves.freqToX(root.display[modelData+"Freq"],root.width)-width/2
            y: Curves.dbToY(root.display[modelData+"GainDb"],root.height)-height/2
            width:22; height:22; activeFocusOnTab:true; enabled:!root.disabled
            Accessible.role:Accessible.Slider; Accessible.name:modelData+" EQ band"
            onActiveFocusChanged: if(!activeFocus)root.finish()
            Keys.onPressed: event => {
                var dir=[Qt.Key_Right,Qt.Key_Up].includes(event.key)?1:[Qt.Key_Left,Qt.Key_Down].includes(event.key)?-1:0
                if(!dir)return
                var p={}, vertical=[Qt.Key_Up,Qt.Key_Down].includes(event.key)
                if(vertical && (event.modifiers & Qt.AltModifier)) {
                    if(modelData!=="mid")return
                    p.midQ=Number(Curves.clamp(root.display.midQ*(dir<0?.9:1.1),.1,10).toFixed(2))
                } else if(vertical) p[modelData+"GainDb"]=Curves.clamp(root.display[modelData+"GainDb"]+dir*(event.modifiers & Qt.ShiftModifier?2:.5),-18,18)
                else {
                    var range=({low:[40,400],mid:[100,8000],high:[2000,16000]})[modelData],factor=event.modifiers & Qt.ShiftModifier?1.2:1.05
                    p[modelData+"Freq"]=Curves.clamp(root.display[modelData+"Freq"]*(dir>0?factor:1/factor),range[0],range[1])
                }
                root.change(p); event.accepted=true
            }
            Keys.onReleased: event => { root.finish(); event.accepted=true }
            Rectangle { anchors.fill:parent; radius:width/2; color:handle.accent; opacity:.18 }
            Rectangle { anchors.centerIn:parent; width:13; height:13; radius:width/2; color:Theme.backgroundPaper; border.width:2; border.color:handle.accent }
            Text { anchors.centerIn:parent; text:handle.modelData[0].toUpperCase(); color:handle.accent; font.family:Theme.sansFamily; font.pixelSize:Theme.fontSizeSmaller; font.weight:Font.DemiBold }
            MouseArea {
                anchors.fill:parent; preventStealing:true; cursorShape:Qt.OpenHandCursor
                property bool dragging:false
                onPressed: { handle.forceActiveFocus(); dragging=true }
                onPositionChanged: event => { if(dragging) { var p=mapToItem(root,event.x,event.y); root.bandAt(handle.modelData,p.x,p.y) } }
                onReleased: { dragging=false; root.finish() }
                onCanceled: { dragging=false; root.finish() }
                onWheel: event => {
                    if(handle.modelData!=="mid") { event.accepted=false; return }
                    var d=event.angleDelta.y || event.pixelDelta.y
                    if(d) { root.change({midQ:Number(Curves.clamp(root.display.midQ*(d<0?.9:1.1),.1,10).toFixed(2))}); wheelEnd.restart() }
                    event.accepted=true
                }
            }
        }
    }
}

import QtQuick
import NodeTool.Timeline
import "effectCurves.js" as Curves
Rectangle {
    id: root
    property var effect: ({thresholdDb:-24,ratio:4,kneeDb:30})
    property bool disabled:false
    property var draft: ({})
    readonly property var display: Object.assign({},effect,draft)
    signal preview(var patch)
    signal commit(var patch)
    objectName:"effect-curve-compressor"
    implicitWidth:180; implicitHeight:180; width:180; height:180
    radius:Theme.radiusSm; border.color:Theme.divider
    gradient: Gradient { GradientStop { position:0; color:Theme.backgroundPaper } GradientStop { position:1; color:Theme.scrimSoft } }
    function change(patch) { draft=Object.assign({},draft,patch); preview(draft) }
    function finish() { if(!Object.keys(draft).length)return; var p=draft; draft={}; commit(p) }
    Canvas {
        id:plot; anchors.fill:parent
        onPaint: {
            var ctx=getContext("2d");ctx.reset();ctx.strokeStyle=Theme.divider;ctx.lineWidth=.5;ctx.setLineDash([2,3])
            ctx.font=Theme.fontSizeSmaller+"px '"+Theme.monoFamily+"'";ctx.fillStyle=Theme.textDisabled
            ;[-48,-36,-24,-12].forEach(function(db) { var p=Curves.compXY(db,width);ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,height);ctx.moveTo(0,height-p);ctx.lineTo(width,height-p);ctx.stroke();ctx.fillText(String(db),p+2,height-4) })
            ctx.beginPath();ctx.strokeStyle=Theme.textDisabled;ctx.moveTo(0,height);ctx.lineTo(width,0);ctx.stroke()
            ctx.setLineDash([]);ctx.beginPath()
            for(var i=0;i<=80;i++) { var input=-60+i/80*60,x=i/80*width,y=height-Curves.compXY(Curves.compTransferDb(input,root.display.thresholdDb,root.display.ratio,root.display.kneeDb),height);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y) }
            ctx.strokeStyle=root.disabled?Theme.textDisabled:Theme.warning;ctx.lineWidth=1.75;ctx.stroke()
            ctx.lineTo(width,height);ctx.lineTo(0,height);ctx.closePath();ctx.fillStyle=Theme.warning;ctx.globalAlpha=root.disabled?.06:.14;ctx.fill();ctx.globalAlpha=.6
            ctx.beginPath();ctx.setLineDash([2,4]);ctx.lineWidth=.75;ctx.strokeStyle=Theme.warningLight
            var t=Curves.compXY(root.display.thresholdDb,width);ctx.moveTo(t,0);ctx.lineTo(t,height);ctx.stroke()
        }
        Connections { target:root; function onDisplayChanged() { plot.requestPaint() } function onDisabledChanged() { plot.requestPaint() } }
    }
    Timer { id:wheelEnd; interval:250; onTriggered:root.finish() }
    Repeater {
        model:["threshold","ratio"]
        delegate: Item {
            id:handle
            required property string modelData
            readonly property bool threshold: modelData==="threshold"
            readonly property real inputDb: threshold?root.display.thresholdDb:-3
            readonly property color accent:threshold?Theme.warningLight:Theme.warning
            objectName:"effect-handle-compressor-"+modelData
            x:Curves.compXY(inputDb,root.width)-width/2
            y:root.height-Curves.compXY(Curves.compTransferDb(inputDb,root.display.thresholdDb,root.display.ratio,root.display.kneeDb),root.height)-height/2
            width:22;height:22;enabled:!root.disabled
            Rectangle { anchors.fill:parent;radius:width/2;color:handle.accent;opacity:.18 }
            Rectangle { anchors.centerIn:parent;width:13;height:13;radius:width/2;color:Theme.backgroundPaper;border.color:handle.accent;border.width:2 }
            Text { anchors.centerIn:parent;text:handle.threshold?"T":"R";color:handle.accent;font.family:Theme.sansFamily;font.pixelSize:Theme.fontSizeSmaller;font.weight:Font.DemiBold }
            MouseArea {
                anchors.fill:parent;preventStealing:true;cursorShape:handle.threshold?Qt.SizeHorCursor:Qt.SizeVerCursor
                property bool dragging:false
                onPressed:dragging=true
                onPositionChanged:event=>{
                    if(!dragging)return
                    var p=mapToItem(root,event.x,event.y),x=Curves.clamp(p.x,0,root.width),y=Curves.clamp(p.y,0,root.height)
                    if(handle.threshold)root.change({thresholdDb:Number(Curves.clamp(Curves.compFromX(x,root.width),-60,0).toFixed(1))})
                    else {
                        var delta=-3-root.display.thresholdDb,compressed=Curves.compFromY(y,root.height)-root.display.thresholdDb
                        var ratio=delta<=0?1+(root.height-y)/root.height*19:compressed<=.01?20:delta/compressed
                        root.change({ratio:Number(Curves.clamp(ratio,1,20).toFixed(2))})
                    }
                }
                onReleased:{dragging=false;root.finish()}
                onCanceled:{dragging=false;root.finish()}
                onWheel:event=>{
                    if(!handle.threshold){event.accepted=false;return}
                    var d=event.angleDelta.y || event.pixelDelta.y
                    if(d){root.change({kneeDb:Number(Curves.clamp(root.display.kneeDb+(d>0?1:-1),0,40).toFixed(1))});wheelEnd.restart()}
                    event.accepted=true
                }
            }
        }
    }
}

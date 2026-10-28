import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import "../Tracks/automation/automationTargets.js" as Targets
Controls.Popup {
    id: root
    parent: Controls.Overlay.overlay
    palette.window: Theme.backgroundPaper; palette.windowText: Theme.textPrimary
    palette.base: Theme.backgroundDefault; palette.text: Theme.textPrimary
    palette.button: Theme.backgroundPaper; palette.buttonText: Theme.textPrimary
    palette.highlight: Theme.primary; palette.highlightedText: Theme.textPrimary
    property TimelineModel timeline: null
    property string trackId: ""
    property string effectId: ""
    property var anchor: null
    property var previews: ({})
    property var openGeneration: 0
    signal finishGestures()
    readonly property var effect: (controller.channel.effects || []).find(e => e.id === effectId) || null
    readonly property var displayed: Object.assign({},effect || {},previews)
    readonly property var fields: effect ? ({
        gain:[{param:"gainDb",label:"Gain",min:-24,max:24,step:.1,digits:1,unit:"dB"}],
        filter:[{param:"frequency",label:"Frequency",min:20,max:20000,step:10,unit:"Hz"},{param:"q",label:"Q",min:.1,max:20,step:.1,digits:1}],
        compressor:[{param:"attackMs",label:"Attack",min:0,max:500,step:1,unit:"ms"},{param:"releaseMs",label:"Release",min:0,max:2000,step:1,unit:"ms"},{param:"kneeDb",label:"Knee",min:0,max:40,step:.5,digits:1,unit:"dB"}]
    })[effect.type] || [] : []
    width: Math.min(parent?parent.width:420,effect ? ({gain:200,eq3:420,filter:240,compressor:380})[effect.type] || 320 : 320)
    height: Math.min(implicitHeight,parent?parent.height*.9:implicitHeight)
    y: {
        if(!anchor || !parent) return 0
        var p=anchor.mapToItem(parent,0,0)
        var preferredY=p.y>parent.height/2?p.y-height:p.y+anchor.height
        return Math.max(0,Math.min(parent.height-height,preferredY))
    }
    font.family:Theme.sansFamily; font.pixelSize:Theme.fontSizeSmall
    padding:Theme.spacingMd
    closePolicy:Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutside
    onAboutToHide:root.finishGestures()
    background:Rectangle { color:Theme.backgroundPaper; border.color:Theme.divider; radius:Theme.radiusMd }
    AutomationController { id:controller; timeline:root.timeline; trackId:root.trackId; master:root.trackId==="" }
    Connections { target:root.timeline; function onDocumentReplaced() { root.close() } }
    function show(trackId,effectId,anchor) {
        root.finishGestures()
        root.trackId=trackId; root.effectId=effectId; root.anchor=anchor; root.previews={}; root.openGeneration=controller.generation()
        var p=anchor.mapToItem(root.parent,0,0)
        root.x=Math.max(0,Math.min(parent.width-width,trackId===""?p.x+anchor.width-width:p.x))
        root.open()
    }
    function formatHz(hz) { return hz>=1000?(hz/1000).toFixed(hz>=10000?1:2)+" kHz":Math.round(hz)+" Hz" }
    function fieldValue(def,value) { return Number((def.min+Math.round((Math.max(def.min,Math.min(def.max,value))-def.min)/def.step)*def.step).toFixed(4)) }
    function preview(p) { previews=Object.assign({},previews,p) }
    function patch(p) {
        if(controller.generation()!==openGeneration)return
        previews={}
        controller.edit(trackId===""?"updateMasterEffect":"updateTrackEffect",{effectId:effectId,patch:p})
    }
    contentItem:Flickable {
        clip:true; contentWidth:width; contentHeight:params.implicitHeight; implicitHeight:params.implicitHeight
        boundsBehavior:Flickable.StopAtBounds
        Controls.ScrollBar.vertical:Controls.ScrollBar {}
        Column {
            id:params; width:parent.width; spacing:Theme.spacingMd
            Row {
                width:parent.width
                Text { width:parent.width-24; text:root.effect?(Targets.EFFECT_LABELS[root.effect.type] || root.effect.type)+" device":"";color:Theme.textPrimary;font.family:Theme.sansFamily;font.pixelSize:Theme.fontSizeSmall }
                Controls.ToolButton { objectName:"close-effect-popover";width:24;height:24;text:"×";Accessible.name:"Close effect";onClicked:root.close() }
            }
            Loader {
                width:parent.width; active:root.effect!==null && root.effect.type==="eq3"
                sourceComponent:Column {
                    spacing:Theme.spacingMd
                    MixerEq3Curve {
                        id:eqCurve
                        width:parent.width;effect:root.displayed;disabled:root.effect===null || root.effect.enabled===false;onPreview:p=>root.preview(p);onCommit:p=>root.patch(p)
                        Connections { target:root; function onFinishGestures() { eqCurve.finish() } }
                    }
                    Row {
                        width:parent.width;spacing:Theme.spacingMicro
                        Repeater {
                            model:[{band:"low",label:"Low shelf",color:Theme.info},{band:"mid",label:"Mid peak",color:Theme.success},{band:"high",label:"High shelf",color:Theme.warning}]
                            delegate:Rectangle {
                                required property var modelData
                                width:(parent.width-4)/3;height:68;radius:Theme.radiusXs;color:Theme.backgroundPaper;border.color:Theme.divider
                                Rectangle { width:parent.width;height:2;color:modelData.color }
                                Column {
                                    x:Theme.spacingXs;y:Theme.spacingXs;width:parent.width-8
                                    Text { text:modelData.label;color:Theme.textSecondary;font.family:Theme.sansFamily;font.pixelSize:Theme.fontSizeSmaller }
                                    Text { text:((root.displayed[modelData.band+"GainDb"] || 0)>=0?"+":"")+(root.displayed[modelData.band+"GainDb"] || 0).toFixed(1)+" dB";color:Theme.textPrimary;font.family:Theme.monoFamily;font.pixelSize:Theme.fontSizeSmaller }
                                    Text { text:root.formatHz(root.displayed[modelData.band+"Freq"] || 0);color:Theme.textPrimary;font.family:Theme.monoFamily;font.pixelSize:Theme.fontSizeSmaller }
                                    Text { visible:modelData.band==="mid";text:"Q "+(root.displayed.midQ || 1).toFixed(2);color:Theme.textPrimary;font.family:Theme.monoFamily;font.pixelSize:Theme.fontSizeSmaller }
                                }
                            }
                        }
                    }
                    Text { width:parent.width;text:"Drag bands · scroll mid for Q";wrapMode:Text.WordWrap;color:Theme.textSecondary;font.family:Theme.sansFamily;font.pixelSize:Theme.fontSizeSmaller }
                }
            }
            Loader {
                width:parent.width;active:root.effect!==null && root.effect.type==="compressor"
                sourceComponent:Row {
                    spacing:Theme.spacingMd
                    MixerCompressorCurve {
                        id:compressorCurve
                        effect:root.displayed;disabled:root.effect===null || root.effect.enabled===false;onPreview:p=>root.preview(p);onCommit:p=>root.patch(p)
                        Connections { target:root; function onFinishGestures() { compressorCurve.finish() } }
                    }
                    Grid {
                        width:parent.width-188;columns:2;spacing:Theme.spacingMicro
                        Repeater {
                            model:[{key:"thresholdDb",label:"Threshold",unit:" dB"},{key:"ratio",label:"Ratio",unit:":1"},{key:"kneeDb",label:"Knee",unit:" dB"},{key:"attackMs",label:"Attack",unit:" ms"}]
                            delegate:Rectangle {
                                required property var modelData
                                width:(parent.width-2)/2;height:82;color:Theme.backgroundPaper;border.color:Theme.divider;radius:Theme.radiusXs
                                Rectangle { width:parent.width;height:2;color:modelData.key==="thresholdDb"?Theme.warningLight:Theme.warning }
                                Column {
                                    x:Theme.spacingXs;y:Theme.spacingMd
                                    Text { text:modelData.label;color:Theme.textSecondary;font.family:Theme.sansFamily;font.pixelSize:Theme.fontSizeSmaller }
                                    Text { text:(root.displayed[modelData.key] || 0).toFixed(1)+modelData.unit;color:Theme.textPrimary;font.family:Theme.monoFamily;font.pixelSize:Theme.fontSizeSmaller }
                                }
                            }
                        }
                    }
                }
            }
            Column {
                width:parent.width;visible:root.effect!==null && root.effect.type==="filter";height:visible?48:0
                Text { text:"Mode";color:Theme.textSecondary;font.family:Theme.sansFamily;font.pixelSize:Theme.fontSizeSmaller }
                Controls.ComboBox {
                    objectName:"filter-mode";width:parent.width;height:24;textRole:"label";enabled:root.effect!==null && root.effect.enabled!==false
                    model:[{value:"lowpass",label:"Low-pass"},{value:"highpass",label:"High-pass"},{value:"bandpass",label:"Band-pass"}]
                    currentIndex:root.effect?model.findIndex(m=>m.value===root.effect.mode):0
                    onActivated:index=>root.patch({mode:model[index].value})
                }
            }
            Repeater {
                model:root.fields
                delegate:InspectorSliderRow {
                    required property var modelData
                    width:params.width;objectName:"effect-param-"+modelData.param
                    label:modelData.label;min:modelData.min;max:modelData.max;step:modelData.step
                    disabled:root.effect===null || root.effect.enabled===false
                    readonly property real current:root.displayed[modelData.param] || 0
                    value:current
                    display:current.toFixed(modelData.digits===undefined?(modelData.step<1?2:0):modelData.digits)+(modelData.unit?" "+modelData.unit:"")
                    onPreview:value=>{var p={};p[modelData.param]=root.fieldValue(modelData,value);root.preview(p)}
                    onChange:value=>{var p={};p[modelData.param]=root.fieldValue(modelData,value);root.patch(p)}
                }
            }
            Text { width:parent.width;visible:root.effect!==null && root.effect.type==="compressor";text:"Drag T = threshold · R = ratio · scroll T = knee";wrapMode:Text.WordWrap;color:Theme.textSecondary;font.family:Theme.sansFamily;font.pixelSize:Theme.fontSizeSmaller }
            Controls.Button { objectName:"remove-effect";text:"Remove effect";onClicked:{controller.edit(root.trackId===""?"removeMasterEffect":"removeTrackEffect",{effectId:root.effectId});root.close()} }
        }
    }
}

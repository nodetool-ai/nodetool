import QtQuick
import NodeTool.UiPrimitives as Ui
import QtQuick.Controls as Controls
import NodeTool.Timeline
import "../Tracks/automation/automationTargets.js" as Targets
Ui.Popover {
    id: root
    property TimelineModel timeline: null
    property string trackId: ""
    property string effectId: ""
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
    onAboutToHide:root.finishGestures()
    AutomationController { id:controller; timeline:root.timeline; trackId:root.trackId; master:root.trackId==="" }
    Connections { target:root.timeline; function onDocumentReplaced() { root.close() } }
    function show(trackId,effectId,anchor) {
        root.finishGestures()
        root.trackId=trackId; root.effectId=effectId; root.previews={}; root.openGeneration=controller.generation()
        root.openAt(anchor)
    }
    function formatHz(hz) { return hz>=1000?(hz/1000).toFixed(hz>=10000?1:2)+" kHz":Math.round(hz)+" Hz" }
    function fieldValue(def,value) { return Number((def.min+Math.round((Math.max(def.min,Math.min(def.max,value))-def.min)/def.step)*def.step).toFixed(4)) }
    function preview(p) { previews=Object.assign({},previews,p) }
    function patch(p) {
        if(controller.generation()!==openGeneration)return
        previews={}
        controller.edit(trackId===""?"updateMasterEffect":"updateTrackEffect",{effectId:effectId,patch:p})
    }
    Flickable {
        anchors.fill: parent
        clip:true; contentWidth:width; contentHeight:params.implicitHeight; implicitHeight:params.implicitHeight
        boundsBehavior:Flickable.StopAtBounds
        Controls.ScrollBar.vertical:Ui.ScrollBar {}
        Column {
            id:params; width:parent.width; spacing:Ui.Metrics.md
            Row {
                width:parent.width
                Ui.Text { role: Ui.Typography.SansLabel; width:parent.width-24; text:root.effect?(Targets.EFFECT_LABELS[root.effect.type] || root.effect.type)+" device":"";}
                Ui.ToolbarIconButton { objectName:"close-effect-popover"; iconName:"close"; accessibleName:qsTr("Close effect"); onClicked:root.close() }
            }
            Loader {
                width:parent.width; active:root.effect!==null && root.effect.type==="eq3"
                sourceComponent:Column {
                    spacing:Ui.Metrics.md
                    MixerEq3Curve {
                        id:eqCurve
                        width:parent.width;effect:root.displayed;disabled:root.effect===null || root.effect.enabled===false;onPreview:p=>root.preview(p);onCommit:p=>root.patch(p);onCanceled:root.previews={}
                        Connections { target:root; function onFinishGestures() { eqCurve.finish() } }
                    }
                    Row {
                        width:parent.width;spacing:Ui.Metrics.micro
                        Repeater {
                            model:[{band:"low",label:"Low shelf",color:Ui.Theme.statusInfo},{band:"mid",label:"Mid peak",color:Ui.Theme.statusSuccess},{band:"high",label:"High shelf",color:Ui.Theme.statusWarning}]
                            delegate:Ui.Surface {
                                required property var modelData
                                width:(parent.width-4)/3;height:68
                                Rectangle { width:parent.width;height:2;color:modelData.color }
                                Column {
                                    x:Ui.Metrics.xs;y:Ui.Metrics.xs;width:parent.width-8
                                    Ui.Text { role: Ui.Typography.SansCaption; text:modelData.label;tone: Ui.Text.Secondary;}
                                    Ui.Text { role: Ui.Typography.MonoCaption; text:((root.displayed[modelData.band+"GainDb"] || 0)>=0?"+":"")+(root.displayed[modelData.band+"GainDb"] || 0).toFixed(1)+" dB";}
                                    Ui.Text { role: Ui.Typography.MonoCaption; text:root.formatHz(root.displayed[modelData.band+"Freq"] || 0);}
                                    Ui.Text { role: Ui.Typography.MonoCaption; visible:modelData.band==="mid";text:"Q "+(root.displayed.midQ || 1).toFixed(2);}
                                }
                            }
                        }
                    }
                    Ui.Text { role: Ui.Typography.SansCaption; width:parent.width;text:"Drag bands · scroll mid for Q";wrapMode:Text.WordWrap;tone: Ui.Text.Secondary;}
                }
            }
            Loader {
                width:parent.width;active:root.effect!==null && root.effect.type==="compressor"
                sourceComponent:Row {
                    spacing:Ui.Metrics.md
                    MixerCompressorCurve {
                        id:compressorCurve
                        effect:root.displayed;disabled:root.effect===null || root.effect.enabled===false;onPreview:p=>root.preview(p);onCommit:p=>root.patch(p);onCanceled:root.previews={}
                        Connections { target:root; function onFinishGestures() { compressorCurve.finish() } }
                    }
                    Grid {
                        width:parent.width-188;columns:2;spacing:Ui.Metrics.micro
                        Repeater {
                            model:[{key:"thresholdDb",label:"Threshold",unit:" dB"},{key:"ratio",label:"Ratio",unit:":1"},{key:"kneeDb",label:"Knee",unit:" dB"},{key:"attackMs",label:"Attack",unit:" ms"}]
                            delegate:Ui.Surface {
                                required property var modelData
                                width:(parent.width-2)/2;height:82
                                Rectangle { width:parent.width;height:2;color:modelData.key==="thresholdDb"?Ui.Theme.statusInfo:Ui.Theme.statusWarning }
                                Column {
                                    x:Ui.Metrics.xs;y:Ui.Metrics.md
                                    Ui.Text { role: Ui.Typography.SansCaption; text:modelData.label;tone: Ui.Text.Secondary;}
                                    Ui.Text { role: Ui.Typography.MonoCaption; text:(root.displayed[modelData.key] || 0).toFixed(1)+modelData.unit;}
                                }
                            }
                        }
                    }
                }
            }
            Column {
                width:parent.width;visible:root.effect!==null && root.effect.type==="filter";height:visible?48:0
                Ui.Text { role: Ui.Typography.SansCaption; text:"Mode";tone: Ui.Text.Secondary;}
                Ui.Select {
                    objectName: "filter-mode"
                    width: parent.width
                    density: Ui.EditorButton.Compact
                    accessibleName: qsTr("Filter mode")
                    enabled: root.effect !== null && root.effect.enabled !== false
                    options: [{value:"lowpass",label:"Low-pass"},{value:"highpass",label:"High-pass"},{value:"bandpass",label:"Band-pass"}]
                    value: root.effect ? root.effect.mode : "lowpass"
                    onValueCommitted: selected => root.patch({mode: selected})
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
            Ui.Text { role: Ui.Typography.SansCaption; width:parent.width;visible:root.effect!==null && root.effect.type==="compressor";text:"Drag T = threshold · R = ratio · scroll T = knee";wrapMode:Text.WordWrap;tone: Ui.Text.Secondary;}
            Ui.EditorButton { objectName:"remove-effect";variant:Ui.EditorButton.Destructive;text:"Remove effect";onClicked:{controller.edit(root.trackId===""?"removeMasterEffect":"removeTrackEffect",{effectId:root.effectId});root.close()} }
        }
    }
}

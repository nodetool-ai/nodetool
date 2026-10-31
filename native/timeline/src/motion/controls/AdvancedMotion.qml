pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
InspectorSection {
    id: root
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: controller ? controller.clip : ({})
    readonly property bool locked: !clip.id || !controller || controller.locked
    readonly property var channels: [{value:"positionX",label:"Position X"},{value:"positionY",label:"Position Y"},{value:"scale",label:"Scale"},{value:"rotation",label:"Rotation"},{value:"opacity",label:"Opacity"}]
    readonly property var links: clip.animationLinks || []
    readonly property string linkIdentity: (clip.id || "") + ":" + links.length
    readonly property string repeaterIdentity: clip.id && clip.repeater ? clip.id : ""
    readonly property string echoIdentity: clip.id && clip.temporalEcho ? clip.id : ""
    title: "Advanced motion"
    defaultOpen: false
    visible: !!clip.id && clip.mediaType !== "audio" && clip.mediaType !== "midi"
    FollowPathControls { id: clips; timeline: root.timelineModel }
    readonly property var clipOptions: clips.allClipOptions
    InspectorEdits { id: edits; model: root.timelineModel }
    property string gestureClipId: ""
    Connections { target: root.controller; function onChanged() { if (root.gestureClipId && root.gestureClipId !== root.clip.id) { edits.cancelGesture(); root.gestureClipId = "" } } }
    Component.onDestruction: edits.cancelGesture()
    function write(field, value, phase) {
        if (locked) return
        const patch = {}; patch[field] = value
        const payload = {clipId:clip.id, patch:patch}
        if (phase === "preview") edits.preview(payload)
        else if (phase === "commit") { if (gestureClipId === clip.id) edits.commit("patchClip",payload); else edits.apply("patchClip",payload); gestureClipId = "" }
        else edits.apply("patchClip",payload)
    }
    function cancel() { edits.cancelGesture(); gestureClipId = "" }
    function begin() { if (!locked) { gestureClipId = clip.id; edits.beginGesture("patchClip",{clipId:clip.id}) } }
    function nested(field, key, value, phase) {
        const next = Object.assign({},clip[field] || {}); next[key] = value; write(field,next,phase)
    }
    function vector(field, key, axis, value, phase) {
        const next = Object.assign({},clip[field] || {})
        next[key] = Object.assign({},key === "colorStep" ? {hueDegrees:0} : {x:0,y:0},next[key] || {},{[axis]:value})
        write(field,next,phase)
    }
    function link(index, key, value, phase) {
        const next = links.map((item,i) => i === index ? Object.assign({},item,{[key]:value}) : item)
        write("animationLinks",next,phase)
    }
    InspectorToggleRow { objectName: "motionRepeaterEnabled"; width: parent.width; label: "Repeater"; checked: !!root.clip.repeater; disabled: root.locked; onChange: next => root.write("repeater",next ? {count:2,positionStep:{x:0,y:0},timeStepMs:0} : null,"") }
    Repeater {
        model: root.repeaterIdentity ? [{key:"count",label:"Copies",min:1,max:128},{key:"columns",label:"Columns",min:1,max:128},{key:"timeStepMs",label:"Time step",min:-10000,max:10000}] : []
        InspectorRow {
            id: repeatRow
            required property var modelData
            width: root.width; label: modelData.label
            InspectorPillInput { objectName: "motionRepeater_" + repeatRow.modelData.key; value: String((root.clip.repeater || {})[repeatRow.modelData.key] ?? (repeatRow.modelData.key === "columns" ? (root.clip.repeater || {}).count : 0)); ariaLabel: repeatRow.modelData.label; disabled: root.locked; scrub: ({step:1,min:repeatRow.modelData.min,max:repeatRow.modelData.max})
                property string gestureOwner: ""
                onGestureStarted: { gestureOwner = root.clip.id; root.begin() }
                onPreview: raw => { if (gestureOwner !== root.clip.id) return; const n = Number(raw); if (Number.isFinite(n) && n >= repeatRow.modelData.min && n <= repeatRow.modelData.max && (repeatRow.modelData.key === "timeStepMs" || Number.isInteger(n))) root.nested("repeater",repeatRow.modelData.key,n,"preview") }
                onCommit: raw => { if (gestureOwner && gestureOwner !== root.clip.id) { gestureOwner = ""; return } gestureOwner = ""; const n = Number(raw); if (raw.trim() && Number.isFinite(n) && n >= repeatRow.modelData.min && n <= repeatRow.modelData.max && (repeatRow.modelData.key === "timeStepMs" || Number.isInteger(n))) root.nested("repeater",repeatRow.modelData.key,n,"commit"); else root.cancel() }
            }
        }
    }
    Repeater {
        model: root.repeaterIdentity ? [{key:"positionStep",axis:"x",label:"Step X"},{key:"positionStep",axis:"y",label:"Step Y"},{key:"rowStep",axis:"x",label:"Row X"},{key:"rowStep",axis:"y",label:"Row Y"},{key:"colorStep",axis:"hueDegrees",label:"Hue step"},{key:"colorStep",axis:"brightness",label:"Brightness step"}] : []
        InspectorRow {
            id: vectorRow
            required property var modelData
            width: root.width; label: modelData.label
            InspectorPillInput { value: String(((root.clip.repeater || {})[vectorRow.modelData.key] || {})[vectorRow.modelData.axis] ?? 0); ariaLabel: vectorRow.modelData.label; disabled: root.locked
                onCommit: raw => { const n = Number(raw); if (raw.trim() && Number.isFinite(n)) root.vector("repeater",vectorRow.modelData.key,vectorRow.modelData.axis,n,"") }
            }
        }
    }
    InspectorToggleRow { objectName:"motionEchoEnabled"; width: parent.width; label: "Temporal echo"; checked: !!root.clip.temporalEcho; disabled: root.locked; onChange: next => root.write("temporalEcho",next ? {copies:2,intervalMs:100,opacityDecay:0.5} : null,"") }
    Repeater {
        model: root.echoIdentity ? [{key:"copies",label:"Echo copies"},{key:"intervalMs",label:"Interval (ms)"},{key:"opacityDecay",label:"Opacity decay"}] : []
        InspectorRow {
            id: echoRow
            required property var modelData
            width: root.width; label: modelData.label
            InspectorPillInput { objectName:"motionEcho_" + echoRow.modelData.key; value: String((root.clip.temporalEcho || {})[echoRow.modelData.key]); ariaLabel: echoRow.modelData.label; disabled: root.locked
                onCommit: raw => { const n = Number(raw); if (raw.trim() && Number.isFinite(n) && ((echoRow.modelData.key === "copies" && Number.isInteger(n) && n >= 1 && n <= 32) || (echoRow.modelData.key === "intervalMs" && n > 0) || (echoRow.modelData.key === "opacityDecay" && n >= 0 && n <= 1))) root.nested("temporalEcho",echoRow.modelData.key,n,"") }
            }
        }
    }
    Ui.EditorButton { objectName:"motionAddLink"; text: "Add link"; enabled: !root.locked && root.links.length < 32 && root.clipOptions.length > 0; onClicked: root.write("animationLinks",root.links.concat([{target:"positionX",sourceClipId:root.clipOptions[0].value,source:"positionX"}]),"") }
    Ui.EditorButton { objectName:"motionAddWiggle"; text: "Add wiggle"; enabled: !root.locked && root.links.length < 32; onClicked: root.write("animationLinks",root.links.concat([{target:"positionX",kind:"wiggle",amplitude:10,frequencyHz:1}]),"") }
    Repeater {
        model: Array.from({length:Number(root.linkIdentity.split(":").pop())}, (_,i) => root.linkIdentity + ":" + i)
        Column {
            id: linkRow
            required property int index
            width: root.width
            readonly property var item: root.links[index] || ({})
            InspectorRow { width: parent.width; label: "Target"; InspectorSelect { label:"Target"; value:linkRow.item.target; options:root.channels; disabled:root.locked; onChange: next => root.link(linkRow.index,"target",next,"") } }
            InspectorRow { width: parent.width; visible: linkRow.item.kind !== "wiggle"; label:"Source clip"; InspectorSelect { label:"Source clip"; value:linkRow.item.sourceClipId || ""; options:root.clipOptions; disabled:root.locked; onChange:next => root.link(linkRow.index,"sourceClipId",next,"") } }
            InspectorRow { width: parent.width; visible: linkRow.item.kind !== "wiggle"; label:"Source channel"; InspectorSelect { label:"Source channel"; value:linkRow.item.source || "positionX"; options:root.channels; disabled:root.locked; onChange:next => root.link(linkRow.index,"source",next,"") } }
            Repeater {
                model: linkRow.item.kind === "wiggle" ? [{key:"amplitude",label:"Amplitude"},{key:"frequencyHz",label:"Frequency (Hz)"},{key:"seed",label:"Seed"}] : [{key:"timeOffsetMs",label:"Time offset (ms)"},{key:"scale",label:"Scale"},{key:"offset",label:"Offset"}]
                InspectorRow {
                    id: linkField
                    required property var modelData
                    width: linkRow.width; label: modelData.label
                    InspectorPillInput { objectName:"motionLink_" + linkRow.index + "_" + linkField.modelData.key; value:String(linkRow.item[linkField.modelData.key] ?? ""); ariaLabel:linkField.modelData.label; disabled:root.locked
                        onCommit: raw => { const k = linkField.modelData.key; const v = Number(raw); if (raw.trim() && Number.isFinite(v) && (k !== "frequencyHz" || v >= 0)) root.link(linkRow.index,k,v,"") }
                    }
                }
            }
            InspectorToggleRow { width: parent.width; visible: linkRow.item.kind !== "wiggle"; label:"Loop"; checked:!!linkRow.item.loop; disabled:root.locked; onChange: next => root.link(linkRow.index,"loop",next,"") }
            Ui.EditorButton { text:"Remove"; enabled:!root.locked; onClicked:root.write("animationLinks",root.links.filter((_,i) => i !== linkRow.index),"") }
        }
    }
}

pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
InspectorSection {
    id: root
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: controller ? controller.clip : ({})
    readonly property bool locked: !clip.id || !controller || controller.locked
    readonly property string fieldIdentity: clip.id && clip.motionBlur ? clip.id : ""
    property string gestureClipId: ""
    title: "Motion blur"
    defaultOpen: false
    visible: !!clip.id && clip.mediaType !== "audio" && clip.mediaType !== "midi"
    InspectorEdits { id: edits; model: root.timelineModel }
    Connections {
        target: root.controller
        function onChanged() {
            if (root.gestureClipId && (root.gestureClipId !== root.clip.id || root.locked)) {
                edits.cancelGesture()
                root.gestureClipId = ""
            }
        }
    }
    Component.onDestruction: edits.cancelGesture()
    function begin() {
        if (!locked) {
            gestureClipId = clip.id
            edits.beginGesture("patchClip", {clipId:clip.id})
        }
    }
    function cancel() { edits.cancelGesture(); gestureClipId = "" }
    function write(value, phase) {
        if (locked) { cancel(); return }
        const payload = {clipId:clip.id, patch:{motionBlur:value}}
        if (phase === "preview") edits.preview(payload)
        else if (phase === "commit") {
            if (gestureClipId === clip.id) edits.commit("patchClip",payload)
            else edits.apply("patchClip",payload)
            gestureClipId = ""
        } else edits.apply("patchClip",payload)
    }
    function setField(key, value, phase) {
        const next = Object.assign({},clip.motionBlur || {})
        next[key] = value
        write(next,phase)
    }
    InspectorToggleRow {
        objectName: "motionBlurEnabled"
        width: parent.width
        label: "Motion blur"
        checked: !!root.clip.motionBlur
        disabled: root.locked
        onChange: next => root.write(next ? {samplesPerFrame:1,shutterAngle:180} : null, "")
    }
    Repeater {
        model: root.fieldIdentity ? [{key:"samplesPerFrame",label:"Samples per frame",min:1,max:32,step:1}, {key:"shutterAngle",label:"Shutter angle",min:0,max:360,step:1}] : []
        InspectorRow {
            id: fieldRow
            required property var modelData
            width: parent ? parent.width : 0
            label: modelData.label
            InspectorPillInput {
                objectName: "motionBlur_" + fieldRow.modelData.key
                value: String((root.clip.motionBlur || {})[fieldRow.modelData.key] ?? (fieldRow.modelData.key === "shutterAngle" ? 180 : 1))
                ariaLabel: fieldRow.modelData.label
                unit: fieldRow.modelData.key === "shutterAngle" ? "°" : ""
                disabled: root.locked
                scrub: ({step:fieldRow.modelData.step,min:fieldRow.modelData.min,max:fieldRow.modelData.max})
                property string gestureOwner: ""
                function valid(raw) {
                    const n = Number(raw)
                    return raw.trim() && Number.isFinite(n) && n >= fieldRow.modelData.min && n <= fieldRow.modelData.max && (fieldRow.modelData.key !== "samplesPerFrame" || Number.isInteger(n))
                }
                onGestureStarted: { gestureOwner = root.clip.id; root.begin() }
                onPreview: raw => { if (gestureOwner === root.clip.id && valid(raw)) root.setField(fieldRow.modelData.key,Number(raw),"preview") }
                onCommit: raw => {
                    if (gestureOwner && gestureOwner !== root.clip.id) { gestureOwner = ""; return }
                    gestureOwner = ""
                    if (valid(raw)) root.setField(fieldRow.modelData.key,Number(raw),"commit")
                    else root.cancel()
                }
            }
        }
    }
}

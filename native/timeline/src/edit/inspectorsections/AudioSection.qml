pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../../../qml/Inspector/primitives/InspectorPrimitivesHelpers.js" as Helpers
// The clip's volume, where people look first for "quieter". Effect Controls
// keeps the same value with its keyframes and fades.
InspectorSection {
    id: root
    objectName: "inspectorAudio"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    property bool groupMode: false
    readonly property var clip: controller ? controller.clip : ({})
    readonly property bool locked: !controller || controller.locked
    title: "Audio"
    defaultOpen: true
    visible: !root.groupMode && !!clip.id && (clip.mediaType === "audio" || clip.mediaType === "video")
    InspectorEdits { id: edits; model: root.timelineModel }
    function volumePayload(raw) {
        const number = Helpers.parseFiniteNumber(raw)
        return !locked && number !== null ? {clipId:clip.id, field:"volumeDb", value:Math.min(24, Math.max(-120, number))} : null
    }
    InspectorRow {
        width: parent.width
        label: "Volume"
        InspectorPillInput {
            objectName: "audioVolume"
            value: (root.clip.volumeDb ?? 0).toFixed(1)
            unit: "dB"
            scrub: ({step:0.5, min:-120, max:24})
            ariaLabel: "Volume in decibels"
            disabled: root.locked
            onGestureStarted: { const p = root.volumePayload(value); if (p) edits.beginGesture("setClipAudio", p) }
            onPreview: raw => { const p = root.volumePayload(raw); if (p) edits.preview(p) }
            onCommit: raw => { const p = root.volumePayload(raw); if (p) edits.commit("setClipAudio", p); else edits.cancelGesture() }
            onCanceled: edits.cancelGesture()
        }
    }
    InspectorCaption { visible: !root.groupMode && root.locked; text: "Unlock the track to change the volume" }
}

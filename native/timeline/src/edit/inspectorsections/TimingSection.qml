pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../../../qml/Inspector/primitives/InspectorPrimitivesHelpers.js" as Helpers
InspectorSection {
    id: root
    objectName: "inspectorTiming"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    property bool groupMode: false
    readonly property var clip: controller ? controller.clip : ({})
    readonly property bool locked: !controller || controller.locked
    readonly property real fps: timelineModel ? timelineModel.fps : 30
    readonly property bool remapped: !!clip.timeRemap && (clip.timeRemap.keyframes || []).length > 0
    readonly property string lockHint: clip.locked ? "Unlock the clip to edit timing" : locked ? "Unlock the track to edit timing" : ""
    title: "Timing"
    defaultOpen: false
    visible: !!clip.id
    InspectorEdits { id: edits; model: root.timelineModel }
    property string observedClipId: ""
    property var gestureClip: null
    function observeSelection() {
        const next = controller ? controller.clipId : ""
        if (next === observedClipId) return
        observedClipId = next
        if (edits) edits.cancelGesture()
        gestureClip = null
    }
    onControllerChanged: observeSelection()
    Component.onCompleted: observeSelection()
    Connections {
        target: root.controller
        function onChanged() { root.observeSelection() }
    }
    function startPayload(raw) {
        const ms = Helpers.parseTimecode(raw, fps)
        return !locked && ms !== null ? {clipId:clip.id, selectedIds:[clip.id], linked:!gestures || gestures.linkedSelection !== false, deltaMs:Math.max(0, ms) - clip.startMs} : null
    }
    function durationPayload(raw) {
        const ms = Helpers.parseSeconds(raw)
        if (locked || ms === null || ms < 1) return null
        const payload = {clipId:clip.id, linked:!gestures || gestures.linkedSelection !== false, deltaMs:ms - (gestureClip || clip).durationMs}
        const cap = gestures && typeof gestures.sourceCapMs === "function" ? gestures.sourceCapMs(clip.id) : clip.sourceDurationMs
        if (Number.isFinite(cap) && cap >= 0) payload.maxSourceDurationMs = cap
        return payload
    }
    function speedPayload(raw) {
        const number = Helpers.parseFiniteNumber(raw)
        return !locked && !remapped && number !== null ? {clipId:clip.id, linked:!gestures || gestures.linkedSelection !== false, speedMultiplier:Math.min(8, Math.max(0.1, number))} : null
    }
    InspectorRow {
        width: parent.width
        label: "Start"
        InspectorPillInput {
            objectName: "timingStart"
            value: Helpers.formatTimecode(root.clip.startMs || 0, root.fps)
            minWidth: InspectorTokens.rowControlMinWidth
            ariaLabel: "Start timecode"
            disabled: root.locked
            onCommit: raw => { const p = root.startPayload(raw); if (p) edits.apply(root.groupMode ? "moveClip" : "moveSelectedClips", p) }
        }
    }
    InspectorRow {
        width: parent.width
        label: "Duration"
        InspectorPillInput {
            objectName: "timingDuration"
            value: ((root.clip.durationMs || 0) / 1000).toFixed(2)
            unit: "s"
            scrub: ({step:0.02, min:0.01})
            ariaLabel: "Duration in seconds"
            disabled: root.locked
            onGestureStarted: { root.gestureClip = root.clip; const p = root.durationPayload(value); if (p) edits.beginGesture("trimClipEnd", p) }
            onPreview: raw => { const p = root.durationPayload(raw); if (p) edits.preview(p) }
            onCommit: raw => { const p = root.durationPayload(raw); if (p) edits.commit("trimClipEnd", p); else edits.cancelGesture(); root.gestureClip = null }
        }
    }
    InspectorCaption { objectName: "timingLockHint"; visible: !root.groupMode && !!root.lockHint; text: root.lockHint }
    InspectorRow {
        width: parent.width
        label: "Speed"
        visible: !root.groupMode && root.clip.mediaType !== "midi" && root.clip.mediaType !== "adjustment"
        InspectorPillInput {
            objectName: "timingSpeed"
            value: (root.clip.speedMultiplier ?? 1).toFixed(2)
            unit: "×"
            scrub: ({step:0.01, min:0.1, max:8})
            ariaLabel: "Playback speed"
            disabled: root.locked || root.remapped
            onGestureStarted: { const p = root.speedPayload(value); if (p) edits.beginGesture("setClipSpeed", p) }
            onPreview: raw => { const p = root.speedPayload(raw); if (p) edits.preview(p) }
            onCommit: raw => { const p = root.speedPayload(raw); if (p) edits.commit("setClipSpeed", p); else edits.cancelGesture(); root.gestureClip = null }
        }
    }
    InspectorCaption { visible: !root.groupMode && root.remapped; text: "Time Remap sets this clip's speed." }
    InspectorToggleRow {
        objectName: "timingHidden"
        width: parent.width
        label: "Hidden"
        visible: root.clip.mediaType !== "midi"
        checked: !!root.clip.hidden
        onChange: next => edits.apply("patchClip", {clipId:root.clip.id, patch:{hidden:next}})
    }
    InspectorCaption { objectName: "groupTrimHint"; visible: root.groupMode; text: "Trimming the group pulls its children inside the window that leaves." }
}

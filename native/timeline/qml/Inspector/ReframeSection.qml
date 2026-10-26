// nt-panel: slot=right id=inspectorReframe order=60 title="Smart Reframe"
import QtQuick
import NodeTool.Timeline
import "primitives"

Item {
    id: root
    objectName: "inspectorReframe"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    property var gestures: typeof tracksRegion !== "undefined" ? tracksRegion.gestures : null
    property var playbackClock: typeof clock !== "undefined" ? clock : null
    property var selectedIds: gestures ? gestures.selection : []
    readonly property var document: edits.document
    readonly property var clip: selectedIds.length === 1 ? (document.clips || []).find(c => c.id === selectedIds[0] && ["video", "image", "overlay"].includes(c.mediaType)) || null : null
    readonly property bool locked: !clip || !!clip.locked || (document.tracks || []).some(t => t.id === clip.trackId && t.locked)
    readonly property var reframe: clip ? clip.reframe : null
    readonly property var mediaTracks: clip ? (document.mediaTracks || []).filter(t => t.clipId === clip.id) : []
    readonly property var reframeTrack: reframe ? mediaTracks.find(t => t.id === reframe.trackId) : undefined
    readonly property bool stale: !!clip && edits.evaluate({op: "isReframeStale", clip: clip, track: reframeTrack})
    readonly property real playheadMs: playbackClock ? playbackClock.time : 0
    readonly property bool playheadInClip: !!clip && playheadMs >= clip.startMs && playheadMs <= clip.startMs + clip.durationMs
    readonly property string clipId: clip ? clip.id : ""
    property real focusX: 0.5
    property real focusY: 0.5
    property real zoom: 1
    onClipIdChanged: { focusX = 0.5; focusY = 0.5; zoom = 1 }
    width: implicitWidth
    implicitWidth: clip ? Theme.trackHeaderWidth : 0
    implicitHeight: clip ? section.implicitHeight : 0
    visible: !!clip
    ReframeController { id: edits; model: root.timelineModel }
    function addKeyframe() {
        if (!clip || locked || !playheadInClip) return
        edits.apply("addClipReframeKeyframe", {clipId: clip.id, sourceMs: edits.sourceMsAt(clip.id, playheadMs), x: focusX, y: focusY, zoom: zoom})
    }
    InspectorSection {
        id: section
        width: parent.width
        title: "Smart reframe"
        InspectorRow {
            width: parent.width
            label: "Subject"
            InspectorSelect {
                objectName: "reframeSubject"
                label: "Reframe subject"
                disabled: root.locked
                value: root.reframe && root.reframe.mode === "track" && root.reframe.trackId ? root.reframe.trackId : root.reframe && root.reframe.mode === "center" ? "center" : "auto"
                options: [{value: "auto", label: "Auto"}, {value: "center", label: "Center"}].concat(root.mediaTracks.filter(t => edits.evaluate({op: "mediaTrackCanDriveReframe", track: t}) && t.sourceAssetId === root.clip.currentAssetId).map(t => ({value: t.id, label: t.name})))
                onChange: value => edits.apply("setClipReframeSubject", {clipId: root.clip.id, mode: value === "auto" || value === "center" ? value : "track", trackId: value})
            }
        }
        ReframeCaption {
            width: parent.width
            text: "Manual framing is recorded in source time, so it stays attached when the clip moves or is trimmed."
        }
        ReframeCaption {
            objectName: "reframeSummary"
            width: parent.width
            visible: !!root.reframe
            text: root.reframe ? (root.reframe.samples || []).length + " automatic samples · " + (root.reframe.keyframes || []).length + " manual corrections" : ""
        }
        ReframeCaption {
            objectName: "reframeStale"
            width: parent.width
            visible: root.stale
            warning: true
            text: "Automatic framing is stale for the current source. The preview uses centered framing until you select or generate a matching subject track. Manual corrections remain active."
        }
        InspectorSliderRow {
            objectName: "reframeFocusX"
            width: parent.width
            label: "Focus X"
            value: root.focusX
            display: Math.round(value * 100) + "%"
            min: 0; max: 1; step: 0.01; origin: 0.5
            disabled: root.locked
            onPreview: value => root.focusX = value
            onChange: value => root.focusX = value
        }
        InspectorSliderRow {
            objectName: "reframeFocusY"
            width: parent.width
            label: "Focus Y"
            value: root.focusY
            display: Math.round(value * 100) + "%"
            min: 0; max: 1; step: 0.01; origin: 0.5
            disabled: root.locked
            onPreview: value => root.focusY = value
            onChange: value => root.focusY = value
        }
        InspectorSliderRow {
            objectName: "reframeZoom"
            width: parent.width
            label: "Zoom"
            value: root.zoom
            display: value.toFixed(2) + "×"
            min: 1; max: 4; step: 0.01; origin: 1
            disabled: root.locked
            onPreview: value => root.zoom = value
            onChange: value => root.zoom = value
        }
        ReframeButton {
            objectName: "reframeAdd"
            width: parent.width
            text: "Add framing keyframe"
            enabled: !root.locked && root.playheadInClip
            onClicked: root.addKeyframe()
        }
        ReframeCaption {
            objectName: "reframeMovePlayhead"
            width: parent.width
            visible: !root.playheadInClip
            text: "Move the playhead over this clip to add a framing keyframe."
        }
        ReframeButton {
            objectName: "reframeClear"
            width: parent.width
            visible: !!root.reframe
            enabled: !root.locked
            destructive: true
            text: "Clear reframe"
            onClicked: edits.apply("clearClipReframe", {clipId: root.clip.id})
        }
    }
}

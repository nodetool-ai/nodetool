// nt-panel: slot=right id=inspector.audio order=20 title="Audio"
import QtQuick
import NodeTool.Timeline
import "AudioFadeShapes.js" as FadeShapes
import "primitives/InspectorPrimitivesHelpers.js" as Helpers

Item {
    id: root
    objectName: "audioSection"
    property var gestures: typeof tracksRegion !== "undefined" ? tracksRegion.gestures : null
    property TimelineModel timeline: gestures ? gestures.timeline : null
    property var selection: gestures ? gestures.selection : []
    readonly property var clip: reader.clip
    property var gesture: null
    visible: !!clip.id
    implicitWidth: visible ? Theme.trackHeaderWidth : 0
    implicitHeight: visible ? section.implicitHeight : 0
    width: implicitWidth
    height: implicitHeight

    function begin(field) {
        gesture = {field: field, timeline: root.timeline, clipId: clip.id, generation: reader.generation, value: clip[field] || 0}
    }
    function preview(field, value) {
        if (!gesture || gesture.field !== field) begin(field)
        gesture = {field: field, timeline: gesture.timeline, clipId: gesture.clipId, generation: gesture.generation, value: value}
    }
    function displayed(field) {
        return gesture && gesture.field === field ? gesture.value : (clip[field] || 0)
    }
    function commit(field, value) {
        const pending = gesture && gesture.field === field ? gesture : null
        gesture = null
        if (!timeline || !clip.id) return
        if (pending && (pending.timeline !== timeline || pending.clipId !== clip.id || pending.generation !== reader.generation)) return
        timeline.applyEdit("setClipAudio", {clipId: clip.id, field: field, value: value})
    }
    function commitSeconds(field, text) {
        const ms = Helpers.parseSeconds(text)
        if (ms === null) { gesture = null; return }
        commit(field, ms)
    }
    ClipAudio { id: reader; timeline: root.timeline; selection: root.selection }
    InspectorSection {
        id: section
        width: parent.width
        title: "Audio"
        icon: Icons.volumeUp
        InspectorSliderRow {
            objectName: "audioVolume"
            width: parent.width
            label: "Volume"
            min: -60
            max: 12
            step: 0.5
            origin: 0
            value: root.displayed("volumeDb")
            display: value.toFixed(1) + " dB"
            onGestureStarted: root.begin("volumeDb")
            onPreview: value => root.preview("volumeDb", value)
            onChange: value => root.commit("volumeDb", value)
        }
        InspectorRow {
            width: parent.width
            label: "Fade in"
            InspectorPillInput {
                objectName: "audioFadeIn"
                value: (root.displayed("fadeInMs") / 1000).toFixed(2)
                unit: "s"
                ariaLabel: "Fade in (seconds)"
                scrub: ({step: 0.02, min: 0})
                onGestureStarted: root.begin("fadeInMs")
                onPreview: text => { const ms = Helpers.parseSeconds(text); if (ms !== null) root.preview("fadeInMs", ms) }
                onCommit: text => root.commitSeconds("fadeInMs", text)
            }
            InspectorSelect {
                objectName: "audioFadeInShape"
                label: "Fade-in shape"
                value: FadeShapes.parseClipFadeShape(root.clip.fadeInShape)
                options: FadeShapes.options
                onChange: value => root.commit("fadeInShape", FadeShapes.parseClipFadeShape(value))
            }
        }
        InspectorRow {
            width: parent.width
            label: "Fade out"
            InspectorPillInput {
                objectName: "audioFadeOut"
                value: (root.displayed("fadeOutMs") / 1000).toFixed(2)
                unit: "s"
                ariaLabel: "Fade out (seconds)"
                scrub: ({step: 0.02, min: 0})
                onGestureStarted: root.begin("fadeOutMs")
                onPreview: text => { const ms = Helpers.parseSeconds(text); if (ms !== null) root.preview("fadeOutMs", ms) }
                onCommit: text => root.commitSeconds("fadeOutMs", text)
            }
            InspectorSelect {
                objectName: "audioFadeOutShape"
                label: "Fade-out shape"
                value: FadeShapes.parseClipFadeShape(root.clip.fadeOutShape)
                options: FadeShapes.options
                onChange: value => root.commit("fadeOutShape", FadeShapes.parseClipFadeShape(value))
            }
        }
    }
}

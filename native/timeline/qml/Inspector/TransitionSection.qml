import QtQuick
import NodeTool.Timeline
import "primitives"
import "primitives/InspectorPrimitivesHelpers.js" as Helpers

Item {
    id: root
    objectName: "inspectorTransition"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var selectedIds: gestures ? gestures.selection : []
    readonly property var document: edits.document
    readonly property var clip: {
        if (selectedIds.length !== 1) return null
        return (document.clips || []).find(c => c.id === selectedIds[0] && c.mediaType !== "audio" && c.mediaType !== "midi") || null
    }
    readonly property bool trackLocked: !!clip && (document.tracks || []).some(t => t.id === clip.trackId && t.locked)
    readonly property bool locked: !clip || !!clip.locked || trackLocked
    readonly property var transition: clip ? clip.transitionIn : null
    readonly property string mode: {
        if (!transition) return "auto"
        if (transition.durationMs <= 0) return "none"
        return ["crossfade", "dipToColor", "wipe", "push", "slide", "zoom"].indexOf(transition.type) >= 0 ? transition.type : "crossfade"
    }
    readonly property bool configurable: mode !== "auto" && mode !== "none"
    readonly property bool hasDirection: mode === "wipe" || mode === "push" || mode === "slide"
    readonly property var hints: ({
        auto: "Overlap this clip with the previous one on the same track to cross-fade.",
        none: "Always a hard cut, even when clips overlap.",
        crossfade: "Both clips fade across the window, measured from this clip's start.",
        dipToColor: "Both clips fade through a solid colour that peaks at the midpoint.",
        wipe: "A feathered edge reveals this clip over the outgoing one.",
        push: "This clip pushes the outgoing one off the frame.",
        slide: "This clip slides in over a stationary outgoing one.",
        zoom: "The outgoing clip scales up while this one scales in."
    })
    width: implicitWidth
    implicitWidth: clip ? 360 : 0
    implicitHeight: clip ? section.implicitHeight : 0
    TransitionController { id: edits; model: root.timelineModel }
    function patchField(patch) {
        if (!locked && transition) edits.apply("setClipTransition", {clipId: clip.id, patch})
    }
    function durationPayload(raw) {
        const ms = Helpers.parseSeconds(raw)
        return !locked && transition && ms !== null ? {clipId: clip.id, durationMs: Math.max(0, ms)} : null
    }
    InspectorSection {
        id: section
        width: parent.width
        visible: !!root.clip
        title: "Transition"
        InspectorRow {
            width: parent.width
            label: "Type"
            InspectorSelect {
                objectName: "transitionType"
                label: "Transition type"
                value: root.mode
                disabled: root.locked
                options: [
                    {value: "auto", label: "Auto"}, {value: "none", label: "None (hard cut)"},
                    {value: "crossfade", label: "Crossfade"}, {value: "dipToColor", label: "Dip to color"},
                    {value: "wipe", label: "Wipe"}, {value: "push", label: "Push"},
                    {value: "slide", label: "Slide"}, {value: "zoom", label: "Zoom"}
                ]
                onChange: mode => { if (!root.locked) edits.apply("setClipTransition", {clipId: root.clip.id, mode}) }
            }
        }
        InspectorRow {
            width: parent.width
            visible: root.configurable
            label: "Duration"
            InspectorPillInput {
                objectName: "transitionDuration"
                value: ((root.transition && root.transition.durationMs > 0 ? root.transition.durationMs : 500) / 1000).toFixed(2)
                unit: "s"
                ariaLabel: "Transition duration"
                scrub: ({step: 0.02, min: 0})
                disabled: root.locked
                onGestureStarted: { const payload = root.durationPayload(value); if (payload) edits.beginGesture("setTransitionDuration", payload) }
                onPreview: raw => { const payload = root.durationPayload(raw); if (payload) edits.preview(payload) }
                onCommit: raw => { const payload = root.durationPayload(raw); if (payload) edits.commit("setTransitionDuration", payload) }
            }
        }
        InspectorColour {
            objectName: "transitionColour"
            width: parent.width
            visible: root.mode === "dipToColor"
            label: "Color"
            value: root.transition && typeof root.transition.color === "string" ? root.transition.color : "#000000"
            disabled: root.locked
            onCommit: color => root.patchField({color})
        }
        InspectorRow {
            width: parent.width
            visible: root.hasDirection
            label: "Direction"
            InspectorSelect {
                objectName: "transitionDirection"
                label: "Transition direction"
                value: root.transition && typeof root.transition.direction === "string" ? root.transition.direction : "left"
                options: [{value: "left", label: "Left"}, {value: "right", label: "Right"}, {value: "up", label: "Up"}, {value: "down", label: "Down"}]
                disabled: root.locked
                onChange: direction => root.patchField({direction})
            }
        }
        InspectorSliderRow {
            objectName: "transitionSoftness"
            width: parent.width
            visible: root.mode === "wipe"
            label: "Softness"
            min: 0; max: 1; step: 0.01; origin: 0
            value: root.transition && typeof root.transition.softness === "number" ? root.transition.softness : 0
            display: value.toFixed(2)
            disabled: root.locked
            onGestureStarted: { if (!root.locked && root.transition) edits.beginGesture("setClipTransition", {clipId: root.clip.id, patch: {softness: value}}) }
            onPreview: softness => { if (!root.locked && root.transition) edits.preview({patch: {softness}}) }
            onChange: softness => { if (!root.locked && root.transition) edits.commit("setClipTransition", {clipId: root.clip.id, patch: {softness}}) }
        }
        TransitionEasingField {
            width: parent.width
            visible: root.configurable
            value: root.transition ? root.transition.easing ?? "" : ""
            disabled: root.locked
            controller: edits
            onChange: easing => root.patchField({easing})
        }
        Text {
            objectName: "transitionCaption"
            width: parent.width
            text: root.clip && root.clip.locked ? "Unlock the clip to edit its transition."
                : root.trackLocked ? "Unlock the track to edit this transition." : root.hints[root.mode]
            wrapMode: Text.WordWrap
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
        }
    }
}

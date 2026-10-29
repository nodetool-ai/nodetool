pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
InspectorSection {
    id: root
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: controller ? controller.clip : ({})
    readonly property string clipIdentity: clip.id || ""
    readonly property bool locked: !clip.id || !controller || controller.locked
    property string gestureClipId: ""
    property int cancellation: 0
    title: "Corners"
    defaultOpen: false
    visible: !!clip.id && ["audio", "midi"].indexOf(clip.mediaType) < 0
    InspectorEdits { id: edits; model: root.timelineModel }
    Connections {
        target: root.controller
        function onChanged() {
            if (root.gestureClipId && (root.gestureClipId !== root.clip.id || root.locked)) root.cancel()
        }
    }
    Component.onDestruction: edits.cancelGesture()
    function cancel() {
        edits.cancelGesture()
        ++cancellation
        gestureClipId = ""
    }
    function begin() {
        if (locked) return
        gestureClipId = clip.id
        edits.beginGesture("patchClip", {clipId:clip.id})
    }
    function valid(next) { return Number.isFinite(next) && next >= 0 && next <= 500 }
    function payload(next) { return {clipId:clip.id, patch:{borderRadius:next}} }
    function preview(next) {
        if (!locked && gestureClipId === clip.id && valid(next)) edits.preview(payload(next))
    }
    function commit(next) {
        if (locked || !valid(next)) { cancel(); return }
        if (gestureClipId === clip.id) edits.commit("patchClip", payload(next))
        else edits.apply("patchClip", payload(next))
        gestureClipId = ""
    }
    Repeater {
        model: root.clipIdentity ? [root.clipIdentity] : []
        delegate: InspectorSliderRow {
            required property string modelData
            property bool activeGesture: false
            property int gestureCancellation: 0
            objectName: "borderRadiusSlider"
            width: root.width
            label: "Radius"
            min: 0
            max: 500
            step: 1
            origin: 0
            value: root.clip.borderRadius ?? 0
            display: value.toFixed(0) + "px"
            disabled: root.locked
            onGestureStarted: {
                activeGesture = true
                root.begin()
                gestureCancellation = root.cancellation
            }
            onPreview: next => {
                if (modelData === root.clip.id && activeGesture && gestureCancellation === root.cancellation) root.preview(next)
            }
            onChange: next => {
                const stale = modelData !== root.clip.id || (activeGesture && gestureCancellation !== root.cancellation)
                activeGesture = false
                if (!stale) root.commit(next)
            }
        }
    }
}

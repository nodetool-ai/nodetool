pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../../edit/inspectorsections" as Sections
InspectorSection {
    id: root
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: controller ? controller.clip : ({})
    readonly property var binding: clip.trackBinding || null
    readonly property bool hasBinding: !!binding
    readonly property string bindingMode: binding ? (binding.mode === "position_scale" ? "position_scale" : "position") : ""
    readonly property bool locked: !clip.id || !controller || controller.locked
    property string draftTrackId: ""
    property string draftMode: "position"
    property string gestureClipId: ""
    property int cancellation: 0
    title: "Follow object"
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
    function cancel() { edits.cancelGesture(); ++cancellation; gestureClipId = "" }
    function payload(key, value) {
        const next = Object.assign({}, binding || {trackId:draftTrackId.trim(), mode:draftMode})
        if (binding) next.mode = bindingMode
        if (key === "offsetX" || key === "offsetY") {
            next.offset = Object.assign({}, next.offset || {x:0,y:0})
            next.offset[key === "offsetX" ? "x" : "y"] = value
        } else next[key] = value
        return {clipId:clip.id, patch:{trackBinding:next}}
    }
    function valid(key, value) {
        if (key === "trackId") return typeof value === "string" && value.trim().length > 0
        if (key === "mode") return value === "position" || value === "position_scale"
        return Number.isFinite(value) && (key !== "scale" || (value >= 0 && value <= 4)) && (key !== "smoothing" || (value >= 0 && value <= 1))
    }
    function change(key, value) {
        if (locked || !valid(key, value)) { cancel(); return }
        if (!binding && key === "trackId") { draftTrackId = value.trim(); return }
        if (!binding && key === "mode") { draftMode = value; return }
        if (key === "trackId") value = value.trim()
        const next = payload(key, value)
        if (gestureClipId === clip.id) edits.commit("patchClip", next)
        else edits.apply("patchClip", next)
        gestureClipId = ""
    }
    function begin() {
        if (locked || !binding) return
        gestureClipId = clip.id
        edits.beginGesture("patchClip", {clipId:clip.id})
    }
    function preview(key, value) {
        if (!locked && binding && gestureClipId === clip.id && valid(key, value)) edits.preview(payload(key, value))
    }
    function follow() {
        if (!locked && draftTrackId.trim()) edits.apply("patchClip", {clipId:clip.id, patch:{trackBinding:{trackId:draftTrackId.trim(),mode:draftMode}}})
    }
    function unbind() {
        cancel()
        if (!locked) edits.apply("patchClip", {clipId:clip.id, patch:{trackBinding:null}})
    }
    InspectorRow {
        width: parent.width; label: "Track ID"
        InspectorPillInput {
            objectName: "followTrackId"; value: root.binding ? root.binding.trackId : root.draftTrackId
            ariaLabel: "Track ID"; disabled: root.locked
            onCommit: next => root.change("trackId", next)
        }
    }
    InspectorRow {
        width: parent.width; label: "Mode"
        InspectorSelect {
            objectName: "followMode"; label: "Follow mode"
            value: root.binding ? root.bindingMode : root.draftMode
            options: [{value:"position",label:"Position"},{value:"position_scale",label:"Position + scale"}]
            disabled: root.locked; onChange: next => root.change("mode", next)
        }
    }
    Sections.InspectorActionButton {
        objectName: "followBind"; text: "Follow"; visible: !root.binding
        enabled: !root.locked && root.draftTrackId.trim().length > 0; onClicked: root.follow()
    }
    Repeater {
        model: root.hasBinding ? ["offsetX", "offsetY"] : []
        delegate: InspectorRow {
            required property string modelData
            id: offsetRow
            width: root.width; label: modelData === "offsetX" ? "Offset X" : "Offset Y"
            InspectorPillInput {
                objectName: offsetRow.modelData; unit: "px"; ariaLabel: offsetRow.label
                value: String(root.binding?.offset?.[offsetRow.modelData === "offsetX" ? "x" : "y"] ?? 0)
                disabled: root.locked
                onCommit: next => { if (next.trim()) root.change(offsetRow.modelData, Number(next)) }
            }
        }
    }
    Repeater {
        model: root.hasBinding ? (root.bindingMode === "position_scale" ? ["scale", "smoothing"] : ["smoothing"]) : []
        delegate: InspectorSliderRow {
            required property string modelData
            property string identity: root.clip.id
            property bool activeGesture: false
            property int gestureCancellation: 0
            objectName: "follow" + modelData
            width: root.width; label: modelData === "scale" ? "Scale" : "Smoothing"
            min: 0; max: modelData === "scale" ? 4 : 1; step: 0.01; origin: modelData === "scale" ? 1 : 0
            value: root.binding?.[modelData] ?? origin; display: value.toFixed(2); disabled: root.locked
            onGestureStarted: { activeGesture = true; identity = root.clip.id; root.begin(); gestureCancellation = root.cancellation }
            onPreview: next => { if (activeGesture && identity === root.clip.id && gestureCancellation === root.cancellation) root.preview(modelData, next) }
            onChange: next => {
                const stale = activeGesture && (identity !== root.clip.id || gestureCancellation !== root.cancellation)
                activeGesture = false
                if (!stale) root.change(modelData, next)
            }
            onCanceled: { activeGesture = false; root.cancel() }
        }
    }
    Sections.InspectorActionButton {
        objectName: "followUnbind"; text: "Stop following"; visible: !!root.binding
        enabled: !root.locked; onClicked: root.unbind()
    }
}

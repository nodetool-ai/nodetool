pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "primitives"

InspectorSection {
    id: root
    objectName: "inspectorTimeRemap"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    property bool groupMode: false
    readonly property var clip: controller ? controller.clip : ({})
    readonly property bool locked: !controller || controller.locked
    visible: !!clip.id && clip.mediaType !== "midi" && !groupMode
    SpeedController { id: edits; model: root.timelineModel }
    property string observedClipId: ""
    function observeSelection() {
        const next = controller ? controller.clipId : ""
        if (next === observedClipId) return
        observedClipId = next
        edits.cancelGesture()
        gestureFrames = null
        duplicate = false
    }
    onControllerChanged: observeSelection()
    onGroupModeChanged: if (groupMode) { edits.cancelGesture(); gestureFrames = null }
    Component.onCompleted: observeSelection()
    Component.onDestruction: edits.cancelGesture()
    Connections {
        target: root.controller
        function onChanged() { root.observeSelection() }
    }
    readonly property var frames: clip && clip.timeRemap ? clip.timeRemap.keyframes : undefined
    property bool duplicate: false
    property var gestureFrames: null
    function beginGesture(index) {
        if (locked || !clip.id || !frames) return
        gestureFrames = frames.slice()
        const p = payload("patch"); p.index = index
        edits.beginGesture("setClipTimeRemap", p)
    }
    title: "Time remap"
    checkable: true
    checked: frames !== undefined
    checkboxDisabled: locked
    defaultOpen: false
    function payload(operation) { return {clipId: clip.id, operation: operation} }
    function run(operation) {
        if (locked || !clip.id) return
        duplicate = false
        edits.apply("setClipTimeRemap", payload(operation))
    }
    function patch(index, field, raw, gesture) {
        if (locked || !clip.id) return
        let value = raw
        if (field !== "easing") {
            value = Number(raw)
            if (raw.trim() === "" || !Number.isFinite(value)) return
            value = field === "t" ? Math.min(1, Math.max(0, value)) : Math.max(0, value)
        }
        const next = payload("patch")
        next.index = index
        next.patch = {}; next.patch[field] = value
        duplicate = field === "t" && (gestureFrames || frames).some((f, i) => i !== index && f.t === value)
        // The C++ gesture keeps its original index while the preview is sorted.
        if (gesture === "preview") edits.preview(next)
        else { edits.commit("setClipTimeRemap", next); gestureFrames = null }
    }
    onCheckedChangedByUser: next => run(next ? "enable" : "disable")
    Text {
        width: parent.width
        visible: root.frames === undefined
        text: "Enable the remap to drive the source position with a curve instead of a speed. It replaces Speed for this clip."
        wrapMode: Text.WordWrap
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmaller
        color: Theme.textSecondary
    }
    Repeater {
        model: root.frames ? root.frames.length : 0
        delegate: Column {
            id: row
            required property int index
            readonly property var frame: root.frames && root.frames[index] ? root.frames[index] : ({t:0, sourceMs:0})
            spacing: Theme.spacingMicro
            width: parent.width
            Row {
                spacing: Theme.spacingMicro
                InspectorPillInput {
                    objectName: "remapTime" + row.index
                    property bool scrubbing: false
                    property string previewValue: ""
                    value: scrubbing ? previewValue : Number(row.frame.t).toFixed(2)
                    minWidth: Theme.controlXs * 2 + Theme.spacingXs
                    ariaLabel: "Time remap keyframe " + (row.index + 1) + " time"
                    scrub: ({step: 0.01, min: 0, max: 1})
                    disabled: root.locked
                    onGestureStarted: {
                        previewValue = value; scrubbing = true
                        root.beginGesture(row.index)
                    }
                    onPreview: raw => { previewValue = raw; root.patch(row.index, "t", raw, "preview") }
                    onCommit: raw => { root.patch(row.index, "t", raw, "commit"); scrubbing = false }
                }
                InspectorPillInput {
                    property bool scrubbing: false
                    property string previewValue: ""
                    value: scrubbing ? previewValue : String(row.frame.sourceMs)
                    unit: "ms"
                    minWidth: Theme.toolbarHeight * 2
                    ariaLabel: "Time remap keyframe " + (row.index + 1) + " source time"
                    scrub: ({step: 10, min: 0})
                    disabled: root.locked
                    onGestureStarted: {
                        previewValue = value; scrubbing = true
                        root.beginGesture(row.index)
                    }
                    onPreview: raw => { previewValue = raw; root.patch(row.index, "sourceMs", raw, "preview") }
                    onCommit: raw => { root.patch(row.index, "sourceMs", raw, "commit"); scrubbing = false }
                }
                InspectorPillInput {
                    value: row.frame.easing ?? ""
                    placeholder: "linear"
                    allowEmpty: true
                    minWidth: Theme.controlXs * 4
                    ariaLabel: "Time remap keyframe " + (row.index + 1) + " easing"
                    disabled: root.locked
                    onCommit: raw => root.patch(row.index, "easing", raw, "commit")
                }
                Button {
                    text: "×"
                    implicitWidth: Theme.controlXs
                    implicitHeight: Theme.controlXs
                    enabled: !root.locked
                    Accessible.name: "Delete time remap keyframe " + (row.index + 1)
                    ToolTip.text: Accessible.name
                    ToolTip.visible: hovered
                    onClicked: {
                        root.duplicate = false
                        const p = root.payload("remove"); p.index = row.index
                        edits.apply("setClipTimeRemap", p)
                    }
                }
            }
            Text {
                width: parent.width
                visible: !!row.frame.easing && !edits.easingReadable(row.frame.easing)
                text: "Not an easing this build reads; plays linear"
                wrapMode: Text.WordWrap
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmaller
                color: Theme.textSecondary
            }
        }
    }
    Text {
        width: parent.width
        visible: root.duplicate
        text: "Another keyframe already sits at that time. Keyframe times must differ."
        wrapMode: Text.WordWrap
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmaller
        color: Theme.textSecondary
    }
    Text {
        width: parent.width
        visible: root.frames !== undefined
        text: "Columns are time (0..1 across the clip), source position, and easing: linear, easeIn, easeOut, easeInOut, easeOutBack, easeOutElastic, easeOutBounce, cubic-bezier(x1,y1,x2,y2) or spring(stiffness,damping,mass)"
        wrapMode: Text.WordWrap
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmaller
        color: Theme.textSecondary
    }
    Text {
        width: parent.width
        visible: root.frames !== undefined
        text: "Source times may descend, which plays the clip backwards. Split and trim refuse a remapped clip until the remap is baked."
        wrapMode: Text.WordWrap
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmaller
        color: Theme.textSecondary
    }
    Row {
        visible: root.frames !== undefined
        spacing: Theme.spacingMd
        Button { text: "Add keyframe"; enabled: !root.locked; onClicked: root.run("add") }
        Button { text: "Clear"; flat: true; enabled: !root.locked; onClicked: root.run("clear") }
    }
}

// nt-panel: slot=right id=inspectorCrop order=59 title="Crop"
import QtQuick
import NodeTool.Timeline
import "primitives"
Item {
    id: root
    objectName: "inspectorCrop"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    property var gestures: typeof tracksRegion !== "undefined" ? tracksRegion.gestures : null
    property var selectedIds: gestures ? gestures.selection : []
    readonly property var document: edits.document
    readonly property var clip: selectedIds.length === 1 ? (document.clips || []).find(c => c.id === selectedIds[0] && ["video", "image", "overlay", "text", "shape", "model3d"].includes(c.mediaType)) || null : null
    readonly property bool locked: !clip || !!clip.locked || (document.tracks || []).some(t => t.id === clip.trackId && t.locked)
    readonly property var crop: clip && clip.crop ? clip.crop : ({left: 0, right: 0, top: 0, bottom: 0})
    width: implicitWidth
    implicitWidth: clip ? Theme.trackHeaderWidth : 0
    implicitHeight: clip ? section.implicitHeight : 0
    visible: !!clip
    ReframeController { id: edits; model: root.timelineModel }
    Component.onDestruction: edits.finishGesture()
    InspectorSection {
        id: section
        width: parent.width
        title: "Crop"
        Repeater {
            model: [{edge: "left", opposite: "right", label: "Crop L"}, {edge: "right", opposite: "left", label: "Crop R"}, {edge: "top", opposite: "bottom", label: "Crop T"}, {edge: "bottom", opposite: "top", label: "Crop B"}]
            delegate: InspectorSliderRow {
                required property var modelData
                objectName: "crop" + modelData.edge
                width: parent.width
                label: modelData.label
                value: root.crop[modelData.edge]
                display: Math.round(value * 100) + "%"
                min: 0
                max: Math.max(0, 0.95 - root.crop[modelData.opposite])
                step: 0.005
                origin: 0
                disabled: root.locked
                function payload(value) { return {clipId: root.clip ? root.clip.id : "", edge: modelData.edge, value: value} }
                onGestureStarted: edits.beginGesture("setClipCropEdge", payload(value))
                onPreview: value => edits.preview(payload(value))
                onChange: value => edits.commit("setClipCropEdge", payload(value))
            }
        }
    }
}

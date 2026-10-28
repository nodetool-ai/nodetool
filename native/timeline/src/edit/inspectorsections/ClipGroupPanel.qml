pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../clipeffects" as Effects
Column {
    id: root
    objectName: "clipGroupPanel"
    required property var timelineModel
    required property var gestures
    required property var controller
    readonly property var clip: controller.clip
    readonly property var members: (edits.document.clips || []).filter(c => c.parentId === clip.id)
    spacing: Theme.spacingXs
    InspectorEdits { id: edits; model: root.timelineModel }
    InspectorSection {
        width: parent.width
        title: "Group"
        InspectorRow {
            width: parent.width
            label: "Name"
            InspectorPillInput {
                objectName: "groupName"
                value: root.clip.name || ""
                minWidth: InspectorTokens.staticValueMaxWidth - Theme.spacingXl - Theme.spacingXs
                ariaLabel: "Group name"
                onCommit: raw => { const name = raw.trim(); if (name) edits.apply("patchClip", {clipId:root.clip.id, patch:{name}}) }
            }
        }
        InspectorRow {
            width: parent.width
            label: "Children"
            InspectorStaticValue { objectName: "groupChildren"; value: String(root.members.length) }
        }
        InspectorCaption { text: "A group draws nothing. Its transform, opacity and window apply to every clip that names it as a parent; each child keeps its own track, so layer order is unchanged." }
        InspectorActionButton {
            objectName: "ungroupChildren"
            text: "Ungroup"
            onClicked: edits.apply("ungroupClips", {clipId:root.clip.id})
        }
    }
    TimingSection { width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller; groupMode: true }
    Effects.ClipAdjustments { width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller }
    Effects.ClipEffectsList { width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller }
}

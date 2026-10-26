pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
InspectorSection {
    id: root
    objectName: "inspectorMedia"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: controller ? controller.clip : ({})
    readonly property bool locked: !controller || controller.locked
    readonly property var document: edits.document
    readonly property var parentOptions: {
        const groups = (document.clips || []).filter(c => c.mediaType === "group")
        const childrenByParent = new Map()
        for (const group of groups) {
            const siblings = childrenByParent.get(group.parentId) || []
            siblings.push(group.id)
            childrenByParent.set(group.parentId, siblings)
        }
        const descendants = new Set()
        const pending = [root.clip.id]
        while (pending.length) {
            const id = pending.pop()
            if (descendants.has(id)) continue
            descendants.add(id)
            for (const child of childrenByParent.get(id) || []) pending.push(child)
        }
        return [{value: "none", label: "None (ungrouped)"}].concat(groups.filter(g => !descendants.has(g.id)).map(g => ({value:g.id, label:g.name || g.id})))
    }
    title: clip.mediaType === "midi" ? "Group" : "Media"
    defaultOpen: false
    visible: !!clip.id && clip.mediaType !== "group" && clip.mediaType !== "adjustment" && (clip.mediaType !== "midi" || parentOptions.length > 1 || clip.parentId !== undefined)
    InspectorEdits { id: edits; model: root.timelineModel }
    function parentChange(value) {
        if (!locked) edits.apply("patchClip", {clipId:clip.id, patch:{parentId:value === "none" ? null : value}})
    }
    InspectorRow {
        width: parent.width
        visible: root.clip.mediaType !== "midi"
        label: "Type"
        InspectorStaticValue { objectName: "mediaType"; value: root.clip.mediaType || "" }
    }
    InspectorRow {
        width: parent.width
        visible: root.clip.mediaType !== "midi"
        label: "Asset"
        InspectorStaticValue { objectName: "mediaAsset"; value: root.clip.currentAssetId ?? "—" }
    }
    InspectorRow {
        width: parent.width
        label: "Parent"
        InspectorSelect {
            objectName: "mediaParent"
            label: "Parent group"
            value: root.clip.parentId ?? "none"
            options: root.parentOptions
            disabled: root.locked
            grow: true
            onChange: next => root.parentChange(next)
        }
    }
    InspectorActionButton {
        objectName: "ungroupParent"
        text: "Ungroup"
        outlined: false
        visible: root.clip.parentId !== undefined
        enabled: !root.locked
        onClicked: root.parentChange("none")
    }
}

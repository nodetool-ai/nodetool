// nt-panel: slot=right id=inspector order=0 title="Inspector"
// PanelSlot supplies no properties. Follow the visual parent chain to the
// TimelineEditor (timeline + clock), then its TracksRegion (gestures).
// All lookups are guarded. Outside an editor this panel shows No selection.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "../../src/edit/inspectorsections" as Sections
Rectangle {
    id: root
    objectName: "timelineInspector"
    implicitWidth: 360
    implicitHeight: parent && parent.parent ? parent.parent.height : 480
    color: Theme.backgroundDefault
    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined) return item
            item = item.parent
        }
        return null
    }
    function findGestures(item) {
        if (!item) return null
        if (item.gestures !== undefined) return item.gestures
        const children = item.children || []
        for (let i = 0; i < children.length; ++i) {
            const found = findGestures(children[i])
            if (found) return found
        }
        return null
    }
    property var editor: null
    property var gestures: null
    function attach() {
        editor = editorAbove()
        gestures = findGestures(editor)
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)
    readonly property var selection: gestures ? gestures.selection : []
    ClipInspectorController {
        id: inspector
        objectName: "clipInspectorController"
        timeline: root.editor ? root.editor.timeline : null
        clock: root.editor ? root.editor.clock : null
        clipId: root.selection.length === 1 ? root.selection[0] : ""
    }
    readonly property var timelineModel: inspector.timeline
    readonly property bool groupSelected: inspector.clip.mediaType === "group"
    Flickable {
        objectName: "inspectorViewport"
        anchors.fill: parent
        anchors.leftMargin: Theme.spacingLg
        anchors.rightMargin: Theme.spacingLg
        anchors.topMargin: Theme.spacingMd
        contentHeight: content.height + Theme.spacingXl * 2
        clip: true
        ScrollBar.vertical: ScrollBar {}
        Column {
            id: content
            width: parent.width
            InspectorHeader { width: parent.width; visible: root.selection.length === 0; eyebrow: "Inspector" }
            Column {
                width: parent.width
                visible: root.selection.length === 0
                topPadding: Theme.spacingXl
                spacing: Theme.spacingMd
                Text { width: parent.width; text: "No selection"; horizontalAlignment: Text.AlignHCenter; color: Theme.textPrimary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall }
                Text { width: parent.width; text: "Select a clip on the timeline to edit its properties."; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap; color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall }
            }
            Column {
                width: parent.width
                visible: root.selection.length > 1
                spacing: Theme.spacingMd
                InspectorHeader {
                    objectName: "multiSelectionHeader"
                    width: parent.width
                    eyebrow: root.selection.length + " clips"
                    actions: [{icon:"⌫", label:"Delete selection", variant:"danger"}]
                    onActionTriggered: label => {
                        if (label === "Delete selection" && root.timelineModel) root.timelineModel.applyEdit("deleteSelected", {selectedIds:root.selection})
                    }
                }
                Column {
                    x: Theme.spacingMicro
                    width: parent.width - x * 2
                    spacing: Theme.spacingMd
                    Sections.InspectorActionButton {
                        objectName: "groupSelectedClips"
                        text: "Group selected clips"
                        onClicked: { if (root.timelineModel) root.timelineModel.applyEdit("groupClips", {selectedIds:root.selection, linked:!root.gestures || root.gestures.linkedSelection !== false}) }
                    }
                    Text {
                        objectName: "groupSelectionHelp"
                        width: parent.width
                        text: "Grouping parents these clips to one group clip: it moves, trims and fades them together. Per-field editing of several clips at once is not yet supported."
                        color: Theme.textSecondary
                        font.family: Theme.sansFamily
                        font.pixelSize: Theme.fontSizeSmall
                        wrapMode: Text.WordWrap
                    }
                }
            }
            ClipIdentityCard {
                objectName: "clipIdentityCard"
                width: parent.width
                visible: !!inspector.clip.id
                name: inspector.clip.name || ""
                metadata: {
                    const clip = inspector.clip
                    if (!clip.id) return []
                    const type = clip.mediaType || ""
                    const parts = [type.charAt(0).toUpperCase()+type.slice(1),(clip.durationMs/1000).toFixed(clip.durationMs < 10000 ? 2 : 1)+"s"]
                    if (clip.width && clip.height) parts.push(clip.width+"×"+clip.height)
                    return parts
                }
                accentColor: Theme.clipAccent(inspector.clip.mediaType || "video")
            }
            // Keep section instances alive without a selection. Extension
            // sections own their selection logic, including a zero height.
            Column {
                width: parent.width
                visible: !!inspector.clip.id && !root.groupSelected
                spacing: Theme.spacingXs
                Sections.RegisteredInspectorSections {
                    width: parent.width
                    beforeRender: true
                    timelineModel: root.timelineModel
                    gestures: root.gestures
                    controller: inspector
                }
                MotionFields { width: parent.width; controller: inspector }
                Sections.RegisteredInspectorSections {
                    width: parent.width
                    beforeRender: false
                    timelineModel: root.timelineModel
                    gestures: root.gestures
                    controller: inspector
                }
                KeyframeAnimations { width: parent.width; controller: inspector }
            }
            Sections.ClipGroupPanel {
                width: parent.width
                visible: !!inspector.clip.id && root.groupSelected
                timelineModel: root.timelineModel
                gestures: root.gestures
                controller: inspector
            }
        }
    }
}

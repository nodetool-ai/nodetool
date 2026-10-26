// nt-panel: slot=right id=inspector order=0 title="Inspector"
// PanelSlot supplies no properties. Follow the visual parent chain to the
// TimelineEditor (timeline + clock), then its TracksRegion (gestures).
// All lookups are guarded. Outside an editor this panel shows No selection.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
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
    Flickable {
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
            InspectorHeader { width: parent.width; visible: !inspector.clip.id; eyebrow: "Inspector" }
            Column {
                width: parent.width
                visible: !inspector.clip.id
                topPadding: Theme.spacingXl
                spacing: Theme.spacingMd
                Text { width: parent.width; text: "No selection"; horizontalAlignment: Text.AlignHCenter; color: Theme.textPrimary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall }
                Text { width: parent.width; text: "Select a clip on the timeline to edit its properties."; horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap; color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall }
            }
            Column {
                width: parent.width
                visible: !!inspector.clip.id
                spacing: Theme.spacingXs
                ClipIdentityCard {
                    width: parent.width
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
                MotionFields { width: parent.width; controller: inspector }
                KeyframeAnimations { width: parent.width; controller: inspector }
            }
        }
    }
}

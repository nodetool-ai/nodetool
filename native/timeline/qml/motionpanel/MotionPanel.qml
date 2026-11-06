// nt-panel: slot=right id=motion order=6 title="Motion"
// How a selected clip moves over time: Animate, Advanced motion, Follow object and Smart reframe.
// Effect Controls holds the clip's fixed transform and its keyframes.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "../../src/edit/inspectorsections" as Sections
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "motionPanel"
    implicitWidth: 360
    implicitHeight: parent && parent.parent ? parent.parent.height : 480
    color: Ui.Theme.surfaceCanvas
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
        objectName: "motionPanelController"
        timeline: root.editor ? root.editor.timeline : null
        // A hidden panel takes no playhead ticks.
        clock: root.editor && root.visible ? root.editor.clock : null
        clipId: root.selection.length === 1 ? root.selection[0] : ""
        onRowEdited: row => { if (root.gestures) root.gestures.keyframeRow = row }
    }
    readonly property string mediaType: inspector.clip.mediaType || ""
    readonly property bool hasPicture: !!inspector.clip.id && mediaType !== "audio" && mediaType !== "midi"
    Ui.EmptyState {
        objectName: "motionPanelEmpty"
        anchors.centerIn: parent
        visible: !root.hasPicture
        maxTextWidth: Math.min(root.width - Ui.Metrics.xxl, Ui.Metrics.dialogCompactWidth)
        title: root.selection.length > 1 ? "Several clips selected" : inspector.clip.id ? "This clip has no picture" : "No clip selected"
        message: root.selection.length > 1 ? "Select one clip to animate it." : "Select a video, image or text clip on the timeline to animate it."
    }
    Flickable {
        id: viewport
        objectName: "motionPanelViewport"
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.lg
        anchors.rightMargin: Ui.Metrics.lg
        anchors.topMargin: Ui.Metrics.md
        visible: root.hasPicture
        contentWidth: width
        contentHeight: content.height + Ui.Metrics.xl
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar { id: scrollBar }
        Column {
            id: content
            width: viewport.width - scrollBar.width
            spacing: Ui.Metrics.xs
            KeyframeAnimations {
                objectName: "motionPanelAnimate"
                width: parent.width
                controller: inspector
                defaultOpen: true
            }
            Sections.RegisteredInspectorSections {
                width: parent.width
                panel: "motion"
                timelineModel: inspector.timeline
                gestures: root.gestures
                controller: inspector
            }
        }
    }
}

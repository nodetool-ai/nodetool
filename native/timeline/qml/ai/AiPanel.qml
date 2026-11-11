// nt-panel: slot=right id=ai order=91 title="AI"
// Generate and regenerate for the selected clip. The Assistant next to it is the chat surface.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "aiPanel"
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
        objectName: "aiPanelController"
        timeline: root.editor ? root.editor.timeline : null
        clock: root.editor && root.visible ? root.editor.clock : null
        clipId: root.selection.length === 1 ? root.selection[0] : ""
    }
    Ui.EmptyState {
        objectName: "aiPanelEmpty"
        anchors.centerIn: parent
        visible: !section.eligible
        maxTextWidth: Math.min(root.width - Ui.Metrics.xxl, Ui.Metrics.dialogCompactWidth)
        title: root.selection.length > 1 ? "Several clips selected" : inspector.clip.id ? "No AI tools for this clip" : "No clip selected"
        message: root.selection.length > 1 ? "Select one clip to generate from it."
            : inspector.clip.id ? "Select a video or image clip, or a generated audio clip." : "Select a clip on the timeline to generate from it or edit it with AI."
    }
    Flickable {
        id: viewport
        objectName: "aiPanelViewport"
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.lg
        anchors.rightMargin: Ui.Metrics.lg
        anchors.topMargin: Ui.Metrics.md
        visible: section.eligible
        contentWidth: width
        contentHeight: content.height + Ui.Metrics.xl
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar { id: scrollBar }
        Column {
            id: content
            width: viewport.width - scrollBar.width
            AiInspectorSection {
                id: section
                width: parent.width
                embedded: true
                timelineModel: inspector.timeline
                gestures: root.gestures
                controller: inspector
            }
        }
    }
}

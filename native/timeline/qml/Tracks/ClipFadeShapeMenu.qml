import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import "../Inspector/AudioFadeShapes.js" as FadeShapes
import NodeTool.UiPrimitives as Ui

Ui.ContextMenu {
    id: root
    property string edge: "in"
    property string current: "linear"
    property TimelineModel timeline: null
    property string clipId: ""
    contentItem.Accessible.name: edge === "in" ? "Fade-in shape" : "Fade-out shape"
    function choose(shape) {
        if (FadeShapes.shapes.indexOf(shape) < 0) return
        if (timeline && clipId) {
            timeline.applyEdit("setClipAudio", {clipId: clipId, field: edge === "in" ? "fadeInShape" : "fadeOutShape", value: shape})
        }
        select(shape)
        close()
    }
    signal select(string shape)
    Instantiator {
        model: FadeShapes.options
        delegate: Ui.MenuItem {
            required property var modelData
            objectName: "fadeShape_" + modelData.value
            text: modelData.label
            checkable: true
            checked: root.current === modelData.value
            Controls.ToolTip.text: FadeShapes.hints[modelData.value]
            Controls.ToolTip.visible: hovered
            onTriggered: root.choose(modelData.value)
        }
        onObjectAdded: (index, object) => root.insertItem(index, object)
        onObjectRemoved: (index, object) => root.removeItem(object)
    }
}

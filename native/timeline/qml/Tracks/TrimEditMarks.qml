// nt-panel: slot=clipBody id=trimEditMarks order=30 title="Edit points"
// The brackets on a clip's selected edit points. Their arms point into the clip.
// Most clips have no mark and so have no children here.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

Item {
    id: root
    objectName: "trimEditMarks-" + (clip.id || "")
    property var clip: ({})
    property var timeline: null
    property var gestures: null
    property var viewState: null
    readonly property var edges: gestures && gestures.trimMode ? gestures.trimMode.marks[clip.id] : undefined
    enabled: false

    Repeater {
        model: root.edges ? Object.keys(root.edges) : []
        delegate: Item {
            id: bracket
            required property string modelData
            readonly property bool end: modelData === "end"
            readonly property color markColor: root.edges && root.edges[modelData] === "ripple"
                ? TimelineVisuals.trimRipple : TimelineVisuals.trimRoll
            objectName: "trimEditMark-" + modelData
            x: end ? root.width - width : 0
            width: Math.min(root.width, TimelineMetrics.trimMarkStroke + TimelineMetrics.trimMarkArm)
            height: root.height
            Rectangle {
                x: bracket.end ? bracket.width - width : 0
                width: Math.min(bracket.width, TimelineMetrics.trimMarkStroke)
                height: parent.height
                color: bracket.markColor
            }
            Rectangle {
                width: bracket.width
                height: TimelineMetrics.trimMarkStroke
                color: bracket.markColor
            }
            Rectangle {
                y: parent.height - height
                width: bracket.width
                height: TimelineMetrics.trimMarkStroke
                color: bracket.markColor
            }
        }
    }
}

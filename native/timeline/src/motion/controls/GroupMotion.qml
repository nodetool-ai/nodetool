pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../tracking" as Tracking
import NodeTool.UiPrimitives as Ui
Column {
    id: root
    objectName: "groupMotion"
    required property var timelineModel
    required property var gestures
    required property ClipInspectorController controller
    spacing: Ui.Metrics.xs
    AdvancedMotion { objectName: "groupAdvancedMotion"; width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller }
    Tracking.TrackBinding { width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller }
    KeyframeAnimations { objectName: "groupAnimations"; width: parent.width; controller: root.controller }
}

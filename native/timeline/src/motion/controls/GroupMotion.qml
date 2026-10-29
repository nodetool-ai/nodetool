pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../tracking" as Tracking
import "../blurcontrols" as Blur
Column {
    id: root
    objectName: "groupMotion"
    required property var timelineModel
    required property var gestures
    required property ClipInspectorController controller
    spacing: Theme.spacingXs
    MotionFields { objectName: "groupMotionFields"; width: parent.width; controller: root.controller }
    BorderRadius { objectName: "groupBorderRadius"; width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller }
    AdvancedMotion { objectName: "groupAdvancedMotion"; width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller }
    Tracking.TrackBinding { width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller }
    Blur.MotionBlur { width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller }
    KeyframeAnimations { objectName: "groupAnimations"; width: parent.width; controller: root.controller }
}

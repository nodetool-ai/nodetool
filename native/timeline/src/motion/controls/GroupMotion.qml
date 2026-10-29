pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
Column {
    id: root
    objectName: "groupMotion"
    required property var timelineModel
    required property var gestures
    required property ClipInspectorController controller
    spacing: Theme.spacingXs
    MotionFields { objectName: "groupMotionFields"; width: parent.width; controller: root.controller }
    AdvancedMotion { objectName: "groupAdvancedMotion"; width: parent.width; timelineModel: root.timelineModel; gestures: root.gestures; controller: root.controller }
    KeyframeAnimations { objectName: "groupAnimations"; width: parent.width; controller: root.controller }
}

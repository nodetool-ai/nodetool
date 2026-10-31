pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
Column {
    id: root
    required property var timelineModel
    required property var gestures
    required property var controller
    required property bool beforeRender
    Repeater {
        model: InspectorSectionRegistry.sections.filter(section => root.beforeRender ? section.order < 30 : section.order > 40 && section.order < 90)
        delegate: Loader {
            id: loader
            required property var modelData
            width: root.width
            height: item && item.visible ? item.implicitHeight : 0
            Component.onCompleted: setSource(modelData.source, {
                timelineModel: Qt.binding(() => root.timelineModel),
                gestures: Qt.binding(() => root.gestures),
                controller: Qt.binding(() => root.controller)
            })
        }
    }
}

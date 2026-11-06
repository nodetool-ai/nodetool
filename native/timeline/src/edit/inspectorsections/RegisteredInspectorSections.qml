pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
Column {
    id: root
    required property var timelineModel
    required property var gestures
    required property var controller
    property string panel: "inspector"
    Repeater {
        model: InspectorSectionRegistry.sections.filter(section => section.panel === root.panel)
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

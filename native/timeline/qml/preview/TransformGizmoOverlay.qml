import QtQuick
import NodeTool.Timeline

Item {
    id: overlay
    objectName: "transformGizmoOverlay"
    TransformGizmoController {
        id: gizmo
        objectName: "transformGizmo"
        anchors.fill: parent
        Accessible.role: Accessible.Grouping
        Accessible.name: qsTr("Transform handles: arrow keys move the clip (Shift for 10 px), period resets")
        Component.onCompleted: Qt.callLater(discover)
        onContextMenuRequested: function(point) {
            menu.x = point.x
            menu.y = point.y
            menu.open()
        }
        onGeometryChanged: if (!available) menu.close()
    }
    ClipTransformContextMenu {
        id: menu
        onAction: function(name) { gizmo.action(name) }
    }
}

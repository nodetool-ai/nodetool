import QtQuick
import NodeTool.Timeline

Item {
    id: overlay
    objectName: "transformGizmoOverlay"
    // A zoomed picture can be far larger than the screen, and this item paints,
    // so it covers only the part on screen.
    property MonitorViewState monitor: null
    function findMonitor() {
        for (let item = parent; item; item = item.parent) {
            if (item.monitor !== undefined) { monitor = item.monitor; return }
        }
        monitor = null
    }
    Component.onCompleted: findMonitor()
    onParentChanged: findMonitor()
    TransformGizmoController {
        id: gizmo
        objectName: "transformGizmo"
        x: overlay.monitor ? overlay.monitor.visibleItemRect.x : 0
        y: overlay.monitor ? overlay.monitor.visibleItemRect.y : 0
        width: overlay.monitor ? overlay.monitor.visibleItemRect.width : overlay.width
        height: overlay.monitor ? overlay.monitor.visibleItemRect.height : overlay.height
        Accessible.role: Accessible.Grouping
        Accessible.name: qsTr("Transform handles: arrow keys move the clip (Shift for 10 px), period resets")
        Component.onCompleted: Qt.callLater(discover)
        onContextMenuRequested: function(point) {
            const at = gizmo.mapToItem(menu.parent, point.x, point.y)
            menu.x = at.x
            menu.y = at.y
            menu.open()
        }
        onGeometryChanged: if (!available) menu.close()
    }
    ClipTransformContextMenu {
        id: menu
        onAction: function(name) { gizmo.action(name) }
    }
}

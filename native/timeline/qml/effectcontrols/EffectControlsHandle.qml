pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
// A Bezier influence handle of the segment arriving at a key. A drag previews through the
// controller's gesture, so the Inspector follows, and release makes one undo step.
Rectangle {
    id: root
    required property var segment
    required property var graph
    required property Item plotItem
    required property string side
    readonly property var handles: segment.handles
    readonly property point point: handles ? (side === "out" ? segment.place(handles.x1, handles.y1) : segment.place(handles.x2, handles.y2)) : Qt.point(0, 0)
    visible: !!handles && point.x >= 0 && point.x <= plotItem.width
    x: point.x - width / 2
    y: Math.max(0, Math.min(plotItem.height, point.y)) - height / 2
    width: Ui.Metrics.md
    height: Ui.Metrics.md
    radius: Ui.Metrics.radiusPill
    color: area.pressed ? Ui.Theme.accentPrimary : Ui.Theme.statusInfo
    Accessible.role: Accessible.Slider
    Accessible.name: (side === "out" ? "Outgoing" : "Incoming") + " influence handle"
    MouseArea {
        id: area
        anchors.fill: parent
        anchors.margins: -Ui.Metrics.xs
        enabled: root.graph.editable
        preventStealing: true
        cursorShape: Qt.SizeAllCursor
        property bool dragging: false
        onPressed: {
            root.graph.holdRange()
            root.graph.panel.setActiveRow(root.graph.rowId)
            root.graph.panel.forceActiveFocus()
            root.graph.panel.handleDragging = true
            root.graph.controller.beginGesture()
            dragging = true
        }
        function payloadAt(mouse) {
            const p = mapToItem(root.plotItem, mouse.x, mouse.y)
            return root.segment.drag(root.side, p.x, p.y)
        }
        onPositionChanged: mouse => {
            if (pressed && dragging && root.graph.panel.handleDragging) root.graph.controller.preview(payloadAt(mouse))
        }
        onReleased: mouse => {
            if (dragging && root.graph.panel.handleDragging) root.graph.controller.commit(payloadAt(mouse))
            root.graph.panel.handleDragging = false
            dragging = false
        }
        onCanceled: {
            root.graph.controller.cancelGesture()
            root.graph.panel.handleDragging = false
            dragging = false
        }
    }
}

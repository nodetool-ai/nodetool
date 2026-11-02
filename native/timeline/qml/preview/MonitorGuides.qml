// Guides over the picture, in canvas pixels. Drag one to move it, or out of the
// picture to remove it. Escape restores it. View state only, so nothing here
// touches the document or undo.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: layer
    required property MonitorViewState monitor
    objectName: "monitorGuides"
    readonly property real pixelsPerCanvasX: monitor.canvasSize.width > 0 ? monitor.pictureRect.width / monitor.canvasSize.width : 1
    readonly property real pixelsPerCanvasY: monitor.canvasSize.height > 0 ? monitor.pictureRect.height / monitor.canvasSize.height : 1
    function canvasPosition(vertical, point) {
        return vertical ? (point.x - monitor.pictureRect.x) / pixelsPerCanvasX
                        : (point.y - monitor.pictureRect.y) / pixelsPerCanvasY
    }
    function contains_(point) { return point.x >= 0 && point.y >= 0 && point.x < width && point.y < height }

    // A move changes the list but not its length, so a drag keeps its delegate.
    Repeater {
        model: layer.monitor.guides.length
        delegate: Item {
            id: guide
            required property int index
            readonly property var entry: layer.monitor.guides[index] || ({vertical: true, position: 0})
            readonly property bool vertical: entry.vertical
            readonly property real line: vertical ? layer.monitor.pictureRect.x + entry.position * layer.pixelsPerCanvasX
                                                  : layer.monitor.pictureRect.y + entry.position * layer.pixelsPerCanvasY
            property real dragStart: 0
            property bool dragging: false
            objectName: "monitorGuide_" + index
            x: vertical ? line - width / 2 : 0
            y: vertical ? 0 : line - height / 2
            width: vertical ? Ui.Metrics.sm : layer.width
            height: vertical ? layer.height : Ui.Metrics.sm
            activeFocusOnTab: !layer.monitor.guidesLocked
            Accessible.role: Accessible.Slider
            Accessible.name: (vertical ? "Vertical guide at " : "Horizontal guide at ") + Math.round(entry.position)
            Keys.onEscapePressed: event => {
                if (!dragging) { event.accepted = false; return }
                dragging = false
                layer.monitor.moveGuide(index, dragStart)
            }
            Rectangle {
                x: guide.vertical ? (parent.width - width) / 2 : 0
                y: guide.vertical ? 0 : (parent.height - height) / 2
                width: guide.vertical ? Ui.Metrics.border : parent.width
                height: guide.vertical ? parent.height : Ui.Metrics.border
                color: Ui.Theme.statusInfo
            }
            MouseArea {
                anchors.fill: parent
                enabled: !layer.monitor.guidesLocked
                preventStealing: true
                cursorShape: guide.vertical ? Qt.SizeHorCursor : Qt.SizeVerCursor
                onPressed: {
                    guide.dragStart = guide.entry.position
                    guide.dragging = true
                    guide.forceActiveFocus()
                }
                onPositionChanged: mouse => {
                    if (!guide.dragging) return
                    const point = mapToItem(layer, mouse.x, mouse.y)
                    if (layer.contains_(point)) layer.monitor.moveGuide(guide.index, layer.canvasPosition(guide.vertical, point))
                }
                onReleased: mouse => {
                    if (!guide.dragging) return
                    guide.dragging = false
                    const point = mapToItem(layer, mouse.x, mouse.y)
                    if (!layer.contains_(point)) {
                        const index = guide.index
                        Qt.callLater(() => layer.monitor.removeGuide(index))
                    }
                }
                onCanceled: {
                    if (!guide.dragging) return
                    guide.dragging = false
                    layer.monitor.moveGuide(guide.index, guide.dragStart)
                }
            }
        }
    }
}

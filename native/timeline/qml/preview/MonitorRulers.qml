// Rulers in canvas pixels along the top and left of the picture. Drag out of a
// ruler to add a guide: the top ruler gives a horizontal guide and the left
// ruler a vertical one. Escape or a release off the picture adds nothing.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: rulers
    required property MonitorViewState monitor
    // The picture box, whose top-left corner is the monitor's origin.
    required property Item pictureBox
    readonly property real thickness: TimelineMetrics.monitorRulerThickness
    readonly property real pixelsPerCanvasX: monitor.canvasSize.width > 0 ? monitor.pictureRect.width / monitor.canvasSize.width : 1
    readonly property real pixelsPerCanvasY: monitor.canvasSize.height > 0 ? monitor.pictureRect.height / monitor.canvasSize.height : 1
    function canvasPosition(vertical, point) {
        return vertical ? (point.x - monitor.pictureRect.x) / pixelsPerCanvasX
                        : (point.y - monitor.pictureRect.y) / pixelsPerCanvasY
    }
    objectName: "monitorRulers"

    component RulerStrip: Item {
        id: strip
        required property bool vertical
        property bool dragging: false
        property point pointer: Qt.point(0, 0)
        readonly property bool overPicture: pointer.x >= 0 && pointer.y >= 0 && pointer.x < rulers.pictureBox.width && pointer.y < rulers.pictureBox.height
        activeFocusOnTab: false
        Keys.onEscapePressed: dragging = false
        MonitorRulerCanvas {
            anchors.fill: parent
            vertical: strip.vertical
            // Each strip starts where the picture host starts.
            origin: strip.vertical ? rulers.pictureBox.y + rulers.monitor.pictureRect.y
                                   : rulers.pictureBox.x + rulers.monitor.pictureRect.x
            pixelsPerUnit: strip.vertical ? rulers.pixelsPerCanvasY : rulers.pixelsPerCanvasX
            background: Ui.Theme.surfacePanel
            textColor: Ui.Theme.textSecondary
            tickColor: Ui.Theme.borderStrong
            font: Ui.Typography.font(Ui.Typography.MonoCaption)
        }
        MouseArea {
            anchors.fill: parent
            preventStealing: true
            cursorShape: strip.vertical ? Qt.SizeHorCursor : Qt.SizeVerCursor
            onPressed: { strip.dragging = true; strip.forceActiveFocus() }
            onPositionChanged: mouse => {
                if (strip.dragging) strip.pointer = mapToItem(rulers.pictureBox, mouse.x, mouse.y)
            }
            onReleased: mouse => {
                if (!strip.dragging) return
                strip.dragging = false
                const point = mapToItem(rulers.pictureBox, mouse.x, mouse.y)
                if (point.x >= 0 && point.y >= 0 && point.x < rulers.pictureBox.width && point.y < rulers.pictureBox.height) {
                    // The left ruler draws vertical guides.
                    rulers.monitor.addGuide(strip.vertical, rulers.canvasPosition(strip.vertical, point))
                }
            }
            onCanceled: strip.dragging = false
        }
    }

    Rectangle {
        width: rulers.thickness
        height: rulers.thickness
        color: Ui.Theme.surfacePanel
    }
    RulerStrip {
        objectName: "monitorRulerTop"
        id: topRuler
        vertical: false
        x: rulers.thickness
        width: rulers.width - x
        height: rulers.thickness
    }
    RulerStrip {
        objectName: "monitorRulerLeft"
        id: leftRuler
        vertical: true
        y: rulers.thickness
        width: rulers.thickness
        height: rulers.height - y
    }
    // The guide being dragged out. It follows the pointer over the picture.
    Rectangle {
        objectName: "monitorGuidePreview"
        readonly property RulerStrip active: leftRuler.dragging ? leftRuler : topRuler.dragging ? topRuler : null
        visible: active !== null && active.overPicture
        x: rulers.thickness + rulers.pictureBox.x + (active && active.vertical ? active.pointer.x : 0)
        y: rulers.thickness + rulers.pictureBox.y + (active && !active.vertical ? active.pointer.y : 0)
        width: active && active.vertical ? Ui.Metrics.border : rulers.pictureBox.width
        height: active && active.vertical ? rulers.pictureBox.height : Ui.Metrics.border
        color: Ui.Theme.statusInfo
    }
}

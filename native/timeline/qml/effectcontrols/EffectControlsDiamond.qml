pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
// One keyframe in a lane. A press selects it and, as in Premiere, leaves the playhead alone. Ctrl or
// Shift adds to the selection. A drag moves the whole selection.
Item {
    id: root
    required property var panel
    required property string rowId
    required property string rowLabel
    required property real ms
    property bool editable: true
    readonly property bool selected: panel.isSelected(rowId, ms)
    readonly property real shownMs: selected && panel.retiming ? ms + panel.retimeDeltaMs : ms
    signal activated()
    objectName: "effectControlsDiamond_" + rowId + "_" + ms
    x: panel.xOf(shownMs) - width / 2
    width: Ui.Metrics.iconMd
    height: Ui.Metrics.iconMd
    Accessible.role: Accessible.Button
    Accessible.name: rowLabel + " keyframe at " + TimelineFormat.playheadTimecode(panel.clipStartMs + ms, panel.fps)
    Rectangle {
        anchors.centerIn: parent
        width: Ui.Metrics.md
        height: Ui.Metrics.md
        rotation: 45
        color: root.selected ? TimelineVisuals.editBlue : Ui.Theme.textSecondary
        border.width: Ui.Metrics.border
        border.color: root.selected ? Ui.Theme.borderStrong : Ui.Theme.surfacePanel
    }
    MouseArea {
        anchors.fill: parent
        enabled: root.editable
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        preventStealing: true
        cursorShape: Qt.SizeHorCursor
        property real pressX: 0
        property bool moved: false
        property bool collapseOnRelease: false
        onPressed: mouse => {
            root.activated()
            if (mouse.button === Qt.RightButton) {
                if (!root.selected) root.panel.selectOnly(root.rowId, root.ms)
                root.panel.menu.checkedEasing = root.panel.controller.easingAt(root.rowId, root.ms)
                root.panel.menu.popup()
                return
            }
            const adding = mouse.modifiers & (Qt.ControlModifier | Qt.ShiftModifier)
            collapseOnRelease = root.selected && !adding
            if (adding) root.panel.toggleSelected(root.rowId, root.ms)
            else if (!root.selected) root.panel.selectOnly(root.rowId, root.ms)
            pressX = mapToItem(root.parent, mouse.x, mouse.y).x
            moved = false
            if (root.selected) root.panel.beginRetime(root.ms)
        }
        onPositionChanged: mouse => {
            if (!pressed || !root.panel.retiming) return
            const x = mapToItem(root.parent, mouse.x, mouse.y).x
            moved = moved || Math.abs(x - pressX) > 3
            if (moved) root.panel.updateRetime(x)
        }
        onReleased: mouse => {
            if (mouse.button !== Qt.LeftButton) return
            if (!moved && collapseOnRelease) root.panel.selectOnly(root.rowId, root.ms)
            root.panel.commitRetime()
        }
        onCanceled: root.panel.endGestures()
    }
}

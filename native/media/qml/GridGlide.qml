import QtQuick
import NodeTool.UiPrimitives as Ui

// Moves a grid tile from its old cell to its new cell during a reflow.
// The view places tiles from C++, which a Behavior does not see, so a jump
// becomes an offset that animates to zero. Use it as the tile's transform:
//   transform: glide.shift
//   GridGlide { id: glide; target: tile; active: reflow.active }
Item {
    id: root
    property Item target: null
    property bool active: false
    readonly property Translate shift: Translate {}
    property real lastX: NaN
    property real lastY: NaN
    // A reused tile shows another asset: it starts at its new cell.
    function reset() {
        glideX.stop(); glideY.stop()
        shift.x = 0; shift.y = 0
        lastX = target ? target.x : NaN
        lastY = target ? target.y : NaN
    }
    width: 0; height: 0
    Component.onCompleted: reset()
    Connections {
        target: root.target
        function onXChanged() {
            if (root.active && !isNaN(root.lastX)) { root.shift.x += root.lastX - root.target.x; glideX.restart() }
            root.lastX = root.target.x
        }
        function onYChanged() {
            if (root.active && !isNaN(root.lastY)) { root.shift.y += root.lastY - root.target.y; glideY.restart() }
            root.lastY = root.target.y
        }
    }
    NumberAnimation { id: glideX; target: root.shift; property: "x"; to: 0; duration: Ui.Metrics.motionNormal; easing.type: Easing.OutCubic }
    NumberAnimation { id: glideY; target: root.shift; property: "y"; to: 0; duration: Ui.Metrics.motionNormal; easing.type: Easing.OutCubic }
}

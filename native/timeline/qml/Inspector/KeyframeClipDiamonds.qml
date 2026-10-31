// KeyframeClipDiamonds uses the required Keyframe* folder prefix instead of the web's ClipKeyframeDiamonds.
// Standalone port of Tracks/ClipKeyframeDiamonds.tsx. Clip delegates mount
// this later. No clock binding: seeks and moves leave through separate hooks.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Item {
    id: root
    property string clipId: ""
    property real durationMs: 0
    property real msPerPx: 1
    property var timesMs: []
    property bool locked: false
    property var formatTime: ms => String(ms) + " ms"
    signal seek(real relativeMs)
    signal move(real fromMs, real toMs)
    property var drag: null
    z: TimelineMetrics.clipOverlayLayer
    Repeater {
        model: root.timesMs
        delegate: Item {
            id: mark
            required property real modelData
            readonly property real shownMs: root.drag && root.drag.fromMs === modelData ? root.drag.toMs : modelData
            objectName: "clip-keyframe-" + root.clipId + "-" + modelData
            x: shownMs / Math.max(0.000001,root.msPerPx) - width / 2
            y: root.height - 2 - 7 - 6
            width: 19
            height: 19
            activeFocusOnTab: true
            Accessible.role: Accessible.Button
            Accessible.name: "Keyframe at " + root.formatTime(modelData)
            Keys.onReturnPressed: root.seek(modelData)
            Keys.onSpacePressed: root.seek(modelData)
            Rectangle {
                anchors.centerIn: parent
                width: 7
                height: 7
                rotation: 45
                color: Ui.Theme.accentPrimary
                border.width: Ui.Metrics.border
                border.color: Ui.Theme.surfacePanel
            }
            MouseArea {
                id: pointer
                anchors.fill: parent
                preventStealing: true
                cursorShape: root.locked ? Qt.PointingHandCursor : Qt.SizeHorCursor
                onPressed: mouse => {
                    const p = mapToItem(root,mouse.x,mouse.y)
                    root.drag = {fromMs:mark.modelData,toMs:mark.modelData,startX:p.x,moved:false}
                    mark.forceActiveFocus()
                }
                onPositionChanged: mouse => {
                    if (!pressed || !root.drag || root.locked) return
                    const dx = mapToItem(root,mouse.x,mouse.y).x - root.drag.startX
                    const moved = root.drag.moved || Math.abs(dx) > 3
                    if (!moved) return
                    root.drag = {fromMs:root.drag.fromMs,toMs:Math.max(0,Math.min(root.durationMs,root.drag.fromMs+dx*root.msPerPx)),startX:root.drag.startX,moved:true}
                }
                onReleased: {
                    const d = root.drag
                    root.drag = null
                    if (!d) return
                    if (!root.locked && d.moved && Math.abs(d.toMs-d.fromMs) > 0.5) root.move(d.fromMs,d.toMs)
                    else root.seek(d.fromMs)
                }
                onCanceled: root.drag = null
                hoverEnabled: true
            }
            ToolTip.visible: pointer.containsMouse && !root.locked
            ToolTip.text: "Drag to move keyframe"
        }
    }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Rectangle {
    id: root
    required property ClipInspectorController controller
    required property string rowId
    required property var timesMs
    property bool disabled: controller.locked
    readonly property real duration: Math.max(1,controller.clip.durationMs || 0)
    property var drag: null
    property real menuTime: 0
    implicitHeight: 16
    color: Ui.Theme.actionHover
    radius: Ui.Metrics.micro
    opacity: disabled ? 0.6 : 1
    function msAt(x) {
        const frac = Math.max(0,Math.min(1,x / Math.max(1,width)))
        const frameMs = 1000 / Math.max(1,controller.timeline ? controller.timeline.fps : 30)
        const start = controller.clip.startMs || 0
        return Math.max(0,Math.min(duration,Math.round((start+frac*duration)/frameMs)*frameMs-start))
    }
    MouseArea {
        anchors.fill: parent
        enabled: !root.disabled
        cursorShape: Qt.PointingHandCursor
        onPressed: mouse => root.controller.seek(root.msAt(mouse.x))
    }
    Rectangle {
        visible: root.timesMs.length > 1
        x: (root.timesMs[0] || 0) / root.duration * root.width
        width: ((root.timesMs[root.timesMs.length-1] || 0)-(root.timesMs[0] || 0)) / root.duration * root.width
        height: Ui.Metrics.border
        anchors.verticalCenter: parent.verticalCenter
        color: Ui.Theme.textDisabled
    }
    Rectangle {
        visible: root.controller.playheadMs >= 0
        x: root.controller.playheadMs / root.duration * root.width - 0.5
        width: Ui.Metrics.border
        height: parent.height
        color: Ui.Theme.statusError
        z: TimelineMetrics.clipOverlayLayer - 1
    }
    Repeater {
        model: root.timesMs
        delegate: Item {
            id: mark
            required property real modelData
            readonly property real shown: root.drag && root.drag.fromMs === modelData ? root.drag.toMs : modelData
            objectName: "keyframe-diamond-" + root.rowId + "-" + modelData
            x: shown / root.duration * root.width - width/2
            anchors.verticalCenter: parent.verticalCenter
            width: 18
            height: 18
            z: TimelineMetrics.clipOverlayLayer
            activeFocusOnTab: !root.disabled
            Accessible.role: Accessible.Button
            Accessible.name: root.rowId + " keyframe at " + TimelineFormat.playheadTimecode((root.controller.clip.startMs || 0)+modelData,root.controller.timeline ? root.controller.timeline.fps : 30)
            function remove() { root.controller.write({action:"delete",row:root.rowId,atMs:modelData}) }
            Keys.onDeletePressed: if (!root.disabled) remove()
            Keys.onPressed: event => {
                if (root.disabled) return
                if (event.key === Qt.Key_Backspace) { remove(); event.accepted = true }
                if (event.key === Qt.Key_Return || event.key === Qt.Key_Space) { root.controller.seek(modelData); event.accepted = true }
            }
            Rectangle {
                anchors.centerIn: parent
                width: 8
                height: 8
                rotation: 45
                color: Math.abs(root.controller.playheadMs-mark.modelData) <= 0.5 ? Ui.Theme.accentPrimary : Ui.Theme.textSecondary
                border.width: Ui.Metrics.border
                border.color: Ui.Theme.surfacePanel
            }
            MouseArea {
                anchors.fill: parent
                enabled: !root.disabled
                acceptedButtons: Qt.LeftButton | Qt.RightButton
                preventStealing: true
                cursorShape: Qt.SizeHorCursor
                onPressed: mouse => {
                    if (mouse.button === Qt.RightButton) {
                        root.menuTime = mark.modelData
                        menu.popup()
                        return
                    }
                    const p = mapToItem(root,mouse.x,mouse.y)
                    root.drag = {fromMs:mark.modelData,toMs:mark.modelData,startX:p.x,moved:false}
                    mark.forceActiveFocus()
                }
                onPositionChanged: mouse => {
                    if (!pressed || !root.drag) return
                    const x = mapToItem(root,mouse.x,mouse.y).x
                    const moved = root.drag.moved || Math.abs(x-root.drag.startX) > 3
                    if (moved) root.drag = {fromMs:root.drag.fromMs,toMs:root.msAt(x),startX:root.drag.startX,moved:true}
                }
                onReleased: {
                    const d = root.drag
                    root.drag = null
                    if (!d) return
                    if (d.moved && Math.abs(d.toMs-d.fromMs) > 0.5) {
                        root.controller.write({action:"move",row:root.rowId,fromMs:d.fromMs,toMs:d.toMs})
                        root.controller.seek(d.toMs)
                    } else root.controller.seek(d.fromMs)
                }
                onCanceled: root.drag = null
            }
        }
    }
    Ui.ContextMenu {
        id: menu
        Repeater {
            model: [{value:"linear",label:"Linear"},{value:"easeIn",label:"Ease in"},{value:"easeOut",label:"Ease out"},{value:"easeInOut",label:"Ease in/out"},{value:"hold",label:"Hold"}]
            Ui.MenuItem {
                required property var modelData
                text: modelData.label
                checkable: true
                checked: { const clip = root.controller.clip; return root.controller.easingAt(root.rowId,root.menuTime) === modelData.value }
                onTriggered: root.controller.write({action:"easing",row:root.rowId,atMs:root.menuTime,easing:modelData.value})
            }
        }
        MenuSeparator { contentItem: Ui.Separator {} }
        Ui.MenuItem { text: "Delete keyframe"; iconName: "deleteOutline"; iconTone: Ui.Text.Error; textTone: Ui.Text.Error; onTriggered: root.controller.write({action:"delete",row:root.rowId,atMs:root.menuTime}) }
    }
}

import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import "automationTargets.js" as Targets
import NodeTool.UiPrimitives as Ui
Rectangle {
    id: root
    property TimelineModel timeline: null
    property var track: ({})
    property var lane: ({id:"",target:{},points:[]})
    property real msPerPx: 10
    readonly property var currentTrack: controller.channel.id ? controller.channel : track
    readonly property var currentLane: (currentTrack.automation || []).find(l => l.id === lane.id) || lane
    readonly property var spec: Targets.automationTargetSpec(currentTrack, lane.target)
    readonly property bool editable: spec !== null && !currentTrack.locked
    readonly property bool on: currentLane.enabled !== false && spec !== null
    readonly property var points: dragging ? draft : (currentLane.points || [])
    property var draft: []
    property int selected: -1
    property bool dragging: false
    property real startTimeMs: 0
    property var gestureGeneration: 0
    objectName: "automation-lane-" + lane.id
    implicitHeight: 56; height: implicitHeight
    color: Ui.Theme.surfaceCanvas; clip: true; activeFocusOnTab: true
    Accessible.role: Accessible.Grouping
    Accessible.name: "Automation lane: " + (spec ? spec.group + " " + spec.label : "Removed device")
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    function yOf(value) { return spec ? 6 + (1-Targets.automationValueToNorm(spec,value))*44 : 28 }
    function valueAtY(y) { return Targets.automationNormToValue(spec,1-(y-6)/44) }
    function hitIndex(x,y) {
        var hit=-1, distance=7
        points.forEach(function(p,i) {
            var d=Math.hypot(p.timeMs/msPerPx-x,root.yOf(p.value)-y)
            if(d<=distance) { hit=i; distance=d }
        })
        return hit
    }
    function commit(next) { controller.setPoints(lane.id,next,controller.generation()) }
    function removeAt(index) {
        if (!editable || index<0) return
        commit(controller.call("removeAutomationPoints",[currentLane.points || [],[index]])); selected=-1
    }
    function setEasing(easing) {
        if (!editable || selected<0) return
        commit(controller.call("setAutomationPointEasing",[currentLane.points || [],selected,easing])); easingMenu.close()
    }
    function finish() {
        if (!dragging) return
        var next=draft
        dragging=false
        controller.setPoints(lane.id,next,gestureGeneration)
    }
    function cancel() { if (dragging) { dragging = false; draft = []; curve.requestPaint() } }
    onActiveFocusChanged: if (!activeFocus) finish()
    onPointsChanged: curve.requestPaint()
    onWidthChanged: curve.requestPaint()
    onMsPerPxChanged: curve.requestPaint()
    onSpecChanged: curve.requestPaint()
    onOnChanged: curve.requestPaint()
    Connections { target: root.timeline; function onDocumentReplaced() { root.dragging=false; root.selected=-1 } }
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape && dragging) { cancel(); event.accepted = true; return }
        if (event.key === Qt.Key_Delete || event.key === Qt.Key_Backspace) {
            removeAt(selected); event.accepted=true
        }
    }
    Canvas {
        id: curve; anchors.fill: parent
        onPaint: {
            var ctx=getContext("2d"); ctx.reset()
            var ps=root.points, vertices=[]
            if(ps.length) vertices=controller.call("automationBreakpoints",[ps,0,{maxStepMs:Math.max(1,root.msPerPx*3)}])
            if (!vertices.length) vertices=[{timeMs:0,value:root.spec?root.spec.value:0}]
            var stroke=root.on?Ui.Theme.accentPrimary:Ui.Theme.textDisabled
            ctx.beginPath()
            if (ps.length) {
                vertices.forEach(function(p,i){ var x=p.timeMs/root.msPerPx,y=root.yOf(p.value); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y) })
            } else ctx.moveTo(0,root.spec?root.yOf(root.spec.value):28)
            var last=vertices[vertices.length-1]
            ctx.lineTo(width,root.spec?root.yOf(last.value):28)
            ctx.strokeStyle=stroke; ctx.lineWidth=1.5
            if(!ps.length)ctx.setLineDash([4,4])
            ctx.stroke()
            if(ps.length) {
                ctx.lineTo(width,height); ctx.lineTo(0,height); ctx.closePath()
                ctx.globalAlpha=root.on ? .12 : .06; ctx.fillStyle=stroke; ctx.fill()
            }
        }
    }
    Repeater {
        model: root.points
        delegate: Rectangle {
            required property var modelData
            required property int index
            x: modelData.timeMs/root.msPerPx-width/2; y: root.yOf(modelData.value)-height/2
            width: 9; height: 9; radius: width/2
            color: !root.on ? Ui.Theme.textDisabled : index === root.selected ? Ui.Theme.textPrimary : Ui.Theme.accentPrimary
            border.color: index === root.selected ? Ui.Theme.accentPrimary : Ui.Theme.surfaceCanvas; border.width: index === root.selected ? Ui.Metrics.focus : Ui.Metrics.border
        }
    }
    Rectangle {
        visible: root.dragging && root.selected>=0 && root.spec !== null
        x: root.selected>=0 && root.points[root.selected] ? root.points[root.selected].timeMs/root.msPerPx+9 : 0
        y: root.selected>=0 && root.points[root.selected] ? Math.max(0,Math.min(38,root.yOf(root.points[root.selected].value)-9)) : 0
        width: readout.implicitWidth+2*Ui.Metrics.xs; height: 18; radius: Ui.Metrics.xs; color: Ui.Theme.surfacePanel
        Ui.Text { id: readout; anchors.centerIn: parent; text: root.spec && root.points[root.selected] ? Targets.format(root.spec,root.points[root.selected].value) : ""; role: Ui.Typography.MonoCaption }
    }
    MouseArea {
        anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton
        property bool playheadPassthrough: true
        cursorShape: root.editable ? Qt.CrossCursor : Qt.ArrowCursor
        onPressed: event => {
            root.forceActiveFocus()
            if (!root.editable) return
            var hit=root.hitIndex(event.x,event.y)
            if (event.button===Qt.RightButton) {
                if (hit>=0) { root.selected=hit; easingMenu.popup(event.x,event.y) }
                return
            }
            root.gestureGeneration=controller.generation()
            root.draft=root.currentLane.points || []
            if(hit<0) {
                var added=controller.call("addAutomationPoint",[root.draft,{timeMs:Math.round(Math.max(0,event.x*root.msPerPx)),value:root.valueAtY(event.y)}])
                root.draft=added.points; hit=added.index
            }
            root.selected=hit; root.startTimeMs=root.draft[hit].timeMs; root.dragging=true
        }
        onPositionChanged: event => {
            if (!root.dragging) return
            var time=event.modifiers & Qt.ShiftModifier ? root.startTimeMs : Math.round(Math.max(0,event.x*root.msPerPx))
            root.draft=controller.call("moveAutomationPoint",[root.draft,root.selected,time,root.valueAtY(event.y)])
        }
        onReleased: root.finish()
        onCanceled: root.cancel()
        onDoubleClicked: event => { root.dragging=false; root.removeAt(root.hitIndex(event.x,event.y)) }
    }
    Ui.ContextMenu {
        id: easingMenu
        Repeater {
            model: [{value:"linear",label:"Linear"},{value:"easeIn",label:"Ease in"},{value:"easeOut",label:"Ease out"},{value:"easeInOut",label:"Ease in/out"},{value:"hold",label:"Hold"}]
            delegate: Ui.MenuItem {
                required property var modelData
                objectName: "automation-easing-"+modelData.value
                text: modelData.label; checkable: true
                checked: !!root.points[root.selected] && (root.points[root.selected].easing || "linear") === modelData.value
                onTriggered: root.setEasing(modelData.value)
            }
        }
        Controls.MenuSeparator { contentItem: Ui.Separator {} }
        Ui.MenuItem { text: "Delete point"; iconName: "deleteOutline"; iconTone: Ui.Text.Error; textTone: Ui.Text.Error; onTriggered: root.removeAt(root.selected) }
    }
    Ui.Separator { anchors.bottom: parent.bottom; width: parent.width }
    Rectangle { anchors.fill: parent; color: "transparent"; border.width: root.activeFocus ? Ui.Metrics.border : 0; border.color: Ui.Theme.accentPrimary }
}

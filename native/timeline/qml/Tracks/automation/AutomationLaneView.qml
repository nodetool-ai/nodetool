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
    property bool mainLane: false
    property real viewportLeft: 0
    property real viewportWidth: width
    readonly property string targetKey: Targets.key(lane.target)
    readonly property color parameterColor: spec ? Targets.color(Ui.Theme,controller.call("automationParamColorRole",[Targets.automationTargetSpecs(currentTrack).findIndex(s => s.key === targetKey),lane.target])) : Ui.Theme.textDisabled
    readonly property var currentTrack: controller.channel.id ? controller.channel : track
    readonly property bool storedLane: (controller.channel.automation || []).some(l => l.id === lane.id)
    readonly property var currentLane: (currentTrack.automation || []).find(l => l.id === lane.id) || lane
    readonly property var spec: Targets.automationTargetSpec(currentTrack, lane.target)
    readonly property bool editable: spec !== null && !currentTrack.locked
    readonly property bool on: currentLane.enabled !== false && spec !== null && currentTrack.automationMode !== "off"
    readonly property var points: dragging ? draft : (currentLane.points || [])
    readonly property real labelValue: curveLabelValue()
    property var draft: []
    property int selected: -1
    property bool dragging: false
    property real startTimeMs: 0
    property var gestureGeneration: 0
    objectName: "automation-lane-" + lane.id
    implicitHeight: 56; height: implicitHeight
    color: mainLane ? Qt.alpha(Ui.Theme.surfaceCanvas,.4) : Ui.Theme.surfaceCanvas; clip: true; activeFocusOnTab: true
    Accessible.role: Accessible.Grouping
    Accessible.name: "Automation lane: " + (spec ? spec.group + " " + spec.label : "Removed device")
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    function yOf(value) { return spec ? 6 + (1-Targets.automationValueToNorm(spec,value))*Math.max(1,height-12) : 28 }
    function valueAtY(y) { return Targets.automationNormToValue(spec,1-(y-6)/Math.max(1,height-12)) }
    function curveLabelValue() {
        if (!spec) { return 0 }
        if (dragging && selected>=0 && points[selected]) { return points[selected].value }
        if (!points.length) { return spec.value }
        const time = viewportLeft*msPerPx
        return storedLane ? controller.laneValueAt(lane.id,time,spec.value)
            : controller.call("automationValueAt",[points,time,spec.value])
    }
    function clipOwnsPointer(x,y) {
        // The clip inset is timeline geometry, independent of UI scale.
        const bottom = 6+Math.min(TimelineMetrics.clipNameBandHeight,Math.max(0,height-12))
        return mainLane && y>=6 && y<bottom && controller.clipNameAt(x*msPerPx)
    }
    function hitIndex(x,y) {
        var hit=-1, distance=7*Ui.Theme.uiScale
        points.forEach(function(p,i) {
            var d=Math.hypot(p.timeMs/msPerPx-x,root.yOf(p.value)-y)
            if(d<=distance) { hit=i; distance=d }
        })
        return hit
    }
    function commit(next) { controller.setPoints(lane.id,next,controller.generation()) }
    onTargetKeyChanged: { cancel(); selected=-1; easingMenu.close(); curve.requestPaint() }
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
        if (!(root.currentTrack.automation || []).some(l => l.id === lane.id)) controller.createWithPoints(lane.target,next,gestureGeneration)
        else controller.setPoints(lane.id,next,gestureGeneration)
    }
    function cancel() { if (dragging) { dragging = false; draft = []; curve.requestPaint() } }
    onActiveFocusChanged: if (!activeFocus) finish()
    onPointsChanged: curve.requestPaint()
    onWidthChanged: curve.requestPaint()
    onHeightChanged: curve.requestPaint()
    onSelectedChanged: curve.requestPaint()
    onMsPerPxChanged: curve.requestPaint()
    onSpecChanged: curve.requestPaint()
    onOnChanged: curve.requestPaint()
    onParameterColorChanged: curve.requestPaint()
    Connections { target: Ui.Theme; function onUiScaleChanged() { curve.requestPaint() } }
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
            var stroke=root.on?root.parameterColor:Ui.Theme.textDisabled
            ctx.beginPath()
            if (ps.length) {
                vertices.forEach(function(p,i){ var x=p.timeMs/root.msPerPx,y=root.yOf(p.value); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y) })
            } else ctx.moveTo(0,root.spec?root.yOf(root.spec.value):28)
            var last=vertices[vertices.length-1]
            ctx.lineTo(width,root.spec?root.yOf(last.value):28)
            ctx.strokeStyle=stroke; ctx.lineWidth=1.5
            ctx.stroke()
            ctx.globalAlpha=.12; ctx.fillStyle=stroke; ctx.fillRect(0,0,width,height)
            ctx.globalAlpha=1
            ps.forEach(function(p,i) {
                ctx.beginPath(); ctx.arc(p.timeMs/root.msPerPx,root.yOf(p.value),Ui.Metrics.sm/2,0,2*Math.PI)
                ctx.fillStyle=root.on && i === root.selected ? Ui.Theme.textOnAccent : stroke; ctx.fill()
                if (i === root.selected) { ctx.strokeStyle=stroke; ctx.lineWidth=Ui.Metrics.focus; ctx.stroke() }
            })
        }
    }
    Rectangle {
        objectName: "automation-value-label"
        visible: root.spec !== null
        x: Math.max(root.viewportLeft,Math.min(root.viewportLeft+root.viewportWidth-width,root.dragging && root.selected>=0 ? root.points[root.selected].timeMs/root.msPerPx : root.viewportLeft))
        y: Math.max(0,Math.min(root.height-height,root.yOf(root.labelValue)-height/2))
        width: readout.implicitWidth+2*Ui.Metrics.xs; height: Ui.Metrics.iconMd; radius: Ui.Metrics.xs; color: Ui.Theme.surfacePanel
        Ui.Text { id: readout; anchors.centerIn: parent; text: root.spec ? Targets.format(root.spec,root.labelValue) : ""; domainColor: root.on ? root.parameterColor : Ui.Theme.textDisabled; role: Ui.Typography.MonoCaption }
    }
    MouseArea {
        anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton
        property bool playheadPassthrough: true
        cursorShape: root.editable ? Qt.CrossCursor : Qt.ArrowCursor
        onPressed: event => {
            var hit=root.hitIndex(event.x,event.y)
            if (hit<0 && root.clipOwnsPointer(event.x,event.y)) { event.accepted=false; return }
            root.forceActiveFocus()
            if (!root.editable) return
            if (event.button===Qt.RightButton) {
                if (hit>=0) { root.selected=hit; easingMenu.popup(event.x,event.y) }
                return
            }
            root.gestureGeneration=controller.generation()
            root.draft=root.currentLane.points || []
            if(hit<0) {
                if (!root.draft.length && !(root.currentTrack.automation || []).some(l => l.id === root.lane.id)) root.draft=[{timeMs:0,value:root.spec.value}]
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

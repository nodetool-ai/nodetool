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
    readonly property var points: dragging || pendingCreation.running ? draft : (currentLane.points || [])
    readonly property real labelValue: curveLabelValue()
    readonly property real firstPointPosition: points.length ? points[0].timeMs/msPerPx : viewportLeft
    readonly property real labelPosition: (draftRevision, dragging) && selected >= 0 && points[selected]
        ? points[selected].timeMs/msPerPx
        : firstPointPosition >= viewportLeft && firstPointPosition <= viewportLeft+viewportWidth ? firstPointPosition : viewportLeft
    property int draftRevision: 0
    property int paintedPointCount: 0
    property int pointVisits: 0
    property var draft: []
    property int selected: -1
    property bool dragging: false
    property bool gestureMoved: false
    property point pressPosition: Qt.point(0,0)
    property real startTimeMs: 0
    property var gestureGeneration: 0
    objectName: "automation-lane-" + lane.id
    implicitHeight: 56; height: implicitHeight
    color: mainLane ? "transparent" : Ui.Theme.surfaceCanvas; clip: true; activeFocusOnTab: true
    Accessible.role: Accessible.Grouping
    Accessible.name: "Automation lane: " + (spec ? spec.group + " " + spec.label : "Removed device")
    AutomationController { id: controller; objectName: "automationLaneController"; timeline: root.timeline; trackId: root.track.id || "" }
    function yOf(value) { return spec ? 6 + (1-Targets.automationValueToNorm(spec,value))*Math.max(1,height-12) : 28 }
    function valueAtY(y) { return Targets.automationNormToValue(spec,1-(y-6)/Math.max(1,height-12)) }
    function curveLabelValue() {
        const revision=draftRevision
        if (!spec) { return 0 }
        if (dragging && selected>=0 && points[selected]) { return points[selected].value }
        if (!points.length) { return spec.value }
        const time = labelPosition*msPerPx
        return storedLane ? controller.laneValueAt(lane.id,time,spec.value)
            : controller.call("automationValueAt",[points,time,spec.value])
    }
    function clipOwnsPointer(x,y) {
        // The clip inset is timeline geometry, independent of UI scale.
        const bottom = 6+Math.min(TimelineMetrics.clipNameBandHeight,Math.max(0,height-12))
        return mainLane && y>=6 && y<bottom && controller.clipNameAt(x*msPerPx,4*msPerPx)
    }
    function lowerBound(time) {
        let lo=0, hi=points.length
        while (lo<hi) {
            const mid=Math.floor((lo+hi)/2)
            ++pointVisits
            if (points[mid].timeMs<time) lo=mid+1
            else hi=mid
        }
        return lo
    }
    function upperBound(time) {
        let lo=0, hi=points.length
        while (lo<hi) {
            const mid=Math.floor((lo+hi)/2)
            ++pointVisits
            if (points[mid].timeMs<=time) lo=mid+1
            else hi=mid
        }
        return lo
    }
    property real tileLeft: 0
    function updateTile() {
        const span=Math.max(1,viewportWidth)
        if (viewportLeft<tileLeft+span*.25 && tileLeft>0 || viewportLeft+span>tileLeft+span*1.75) {
            tileLeft=Math.max(0,viewportLeft-span*.5)
        }
    }
    onViewportLeftChanged: updateTile()
    onViewportWidthChanged: updateTile()
    Component.onCompleted: updateTile()
    function hitIndex(x,y) {
        var hit=-1, distance=7*Ui.Theme.uiScale
        const first = lowerBound((x-distance)*msPerPx)
        const end = lowerBound((x+distance)*msPerPx+0.001)
        for (let i=first; i<end; ++i) {
            const p=points[i]
            ++pointVisits
            const d=Math.hypot(p.timeMs/msPerPx-x,root.yOf(p.value)-y)
            if(d<=distance) { hit=i; distance=d }
        }
        return hit
    }
    function commit(next) { controller.setGesturePoints(lane.id,next,controller.gestureGeneration()) }
    onTargetKeyChanged: { cancel(); selected=-1; easingMenu.close(); curve.requestPaint() }
    function removeAt(index) {
        if (!editable || index<0) return
        if (pendingCreation.running) { cancel(); return }
        commit(controller.call("removeAutomationPoints",[currentLane.points || [],[index]])); selected=-1
    }
    function setEasing(easing) {
        if (!editable || selected<0) return
        commit(controller.call("setAutomationPointEasing",[currentLane.points || [],selected,easing])); easingMenu.close()
    }
    function applyDraft() {
        if (!storedLane) controller.createWithGesturePoints(lane.target,draft,gestureGeneration)
        else controller.setGesturePoints(lane.id,draft,gestureGeneration)
    }
    function flushPending() {
        if (!pendingCreation.running) return
        pendingCreation.stop()
        applyDraft()
    }
    function finish(immediate = false) {
        if (!dragging) return
        dragging=false
        // A virtual lane's first click stays reversible until Qt resolves a double-click.
        if (!storedLane && !gestureMoved && !immediate) pendingCreation.start()
        else applyDraft()
    }
    function cancel() {
        pendingCreation.stop()
        dragging=false; draft=[]; selected=-1; curve.requestPaint()
    }
    Timer {
        id: pendingCreation
        interval: Qt.styleHints.mouseDoubleClickInterval
        onTriggered: root.applyDraft()
    }
    onActiveFocusChanged: if (!activeFocus) { flushPending(); finish(true) }
    Component.onDestruction: flushPending()
    onDraftRevisionChanged: curve.requestPaint()
    onPointsChanged: curve.requestPaint()
    onWidthChanged: curve.requestPaint()
    onHeightChanged: curve.requestPaint()
    onSelectedChanged: curve.requestPaint()
    onMsPerPxChanged: curve.requestPaint()
    onSpecChanged: curve.requestPaint()
    onOnChanged: curve.requestPaint()
    onParameterColorChanged: curve.requestPaint()
    Connections { target: Ui.Theme; function onUiScaleChanged() { curve.requestPaint() } }
    Connections { target: root.timeline; function onDocumentReplaced() { root.cancel() } }
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape && (dragging || pendingCreation.running)) { cancel(); event.accepted = true; return }
        if (event.key === Qt.Key_Delete || event.key === Qt.Key_Backspace) {
            removeAt(selected); event.accepted=true
        }
    }
    // AU3/AU5: the whole lane carries the parameter colour at low alpha, like Logic.
    Rectangle {
        objectName: "automation-lane-tint"
        anchors.fill: parent
        color: Qt.alpha(root.on ? root.parameterColor : Ui.Theme.textDisabled, root.on ? .12 : .04)
    }
    Canvas {
        id: curve
        objectName: "automation-curve-canvas"
        // Retain a two-viewport tile while scrolling within its first half.
        x: root.tileLeft
        width: Math.max(0,Math.min(root.viewportWidth*2,root.width-x))
        height: root.height
        onXChanged: requestPaint()
        onWidthChanged: requestPaint()
        onPaint: {
            var ctx=getContext("2d"); ctx.reset()
            var ps=root.points, vertices=[]
            const from=curve.x*root.msPerPx, to=(curve.x+curve.width)*root.msPerPx
            const first=Math.max(0,root.lowerBound(from)-1)
            const last=Math.min(ps.length,root.upperBound(to)+1)
            root.paintedPointCount=last-first
            if(ps.length) vertices=controller.call("automationBreakpoints",[ps.slice(first,last),from,{maxStepMs:Math.max(1,root.msPerPx*3)}])
            if (!vertices.length) vertices=[{timeMs:0,value:root.spec?root.spec.value:0}]
            var stroke=root.on?root.parameterColor:Ui.Theme.textDisabled
            ctx.beginPath()
            if (ps.length) {
                vertices.forEach(function(p,i){ var x=p.timeMs/root.msPerPx-curve.x,y=root.yOf(p.value); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y) })
            } else ctx.moveTo(0,root.spec?root.yOf(root.spec.value):28)
            var tail=vertices[vertices.length-1]
            ctx.lineTo(width,root.spec?root.yOf(tail.value):28)
            ctx.strokeStyle=stroke; ctx.lineWidth=1.5
            ctx.stroke()
            for (let i=first; i<last; ++i) {
                const p=ps[i]
                ++root.pointVisits
                if (p.timeMs<from || p.timeMs>to) continue
                ctx.beginPath(); ctx.arc(p.timeMs/root.msPerPx-curve.x,root.yOf(p.value),Ui.Metrics.sm/2,0,2*Math.PI)
                ctx.fillStyle=root.on && i === root.selected ? Ui.Theme.textOnAccent : stroke; ctx.fill()
                if (i === root.selected) { ctx.strokeStyle=stroke; ctx.lineWidth=Ui.Metrics.focus; ctx.stroke() }
            }
        }
    }
    Rectangle {
        objectName: "automation-value-label"
        visible: root.spec !== null
        x: Math.max(root.viewportLeft,Math.min(root.viewportLeft+root.viewportWidth-width,root.labelPosition))
        y: Math.max(0,Math.min(root.height-height,root.yOf(root.labelValue)-height/2))
        width: readout.implicitWidth+2*Ui.Metrics.xs; height: Ui.Metrics.iconMd; radius: Ui.Metrics.xs; color: Ui.Theme.surfacePanel
        Ui.Text { id: readout; anchors.centerIn: parent; text: root.spec ? Targets.format(root.spec,root.labelValue) : ""; domainColor: root.on ? root.parameterColor : Ui.Theme.textDisabled; role: Ui.Typography.MonoCaption }
    }
    MouseArea {
        anchors.fill: parent; acceptedButtons: Qt.LeftButton | Qt.RightButton
        function playheadPassthrough(point) { return root.editable && root.hitIndex(point.x,point.y)>=0 && !root.clipOwnsPointer(point.x,point.y) }
        cursorShape: root.editable ? Qt.CrossCursor : Qt.ArrowCursor
        onPressed: event => {
            var hit=root.hitIndex(event.x,event.y)
            if (pendingCreation.running) {
                if (hit>=0 && event.button===Qt.LeftButton) return
                root.flushPending()
            }
            // The clip name bar keeps every clip gesture, also under an automation point.
            if (root.clipOwnsPointer(event.x,event.y)) { event.accepted=false; return }
            root.forceActiveFocus()
            if (!root.editable) return
            if (event.button===Qt.RightButton) {
                if (hit>=0) { root.selected=hit; easingMenu.popup(event.x,event.y) }
                return
            }
            root.gestureMoved=false; root.pressPosition=Qt.point(event.x,event.y)
            root.gestureGeneration=controller.gestureGeneration()
            root.draft=(root.currentLane.points || []).slice()
            if(hit<0) {
                if (!root.draft.length && !(root.currentTrack.automation || []).some(l => l.id === root.lane.id)) root.draft=[{timeMs:0,value:root.spec.value}]
                var added=controller.call("addAutomationPoint",[root.draft,{timeMs:Math.round(Math.max(0,event.x*root.msPerPx)),value:root.valueAtY(event.y)}])
                root.draft=added.points; hit=added.index
            }
            root.selected=hit; root.startTimeMs=root.draft[hit].timeMs; root.dragging=true
        }
        onPositionChanged: event => {
            if (!root.dragging) return
            root.gestureMoved = root.gestureMoved || event.x!==root.pressPosition.x || event.y!==root.pressPosition.y
            var time=event.modifiers & Qt.ShiftModifier ? root.startTimeMs : Math.round(Math.max(0,event.x*root.msPerPx))
            const i=root.selected
            const lo=i>0 ? root.draft[i-1].timeMs : 0
            const hi=i+1<root.draft.length ? root.draft[i+1].timeMs : Infinity
            root.draft[i]=Object.assign({},root.draft[i],{timeMs:Math.min(hi,Math.max(lo,time)),value:root.valueAtY(event.y)})
            root.draftChanged()
            root.pointsChanged()
            ++root.draftRevision
        }
        onReleased: root.finish()
        onCanceled: root.cancel()
        onDoubleClicked: event => {
            if (pendingCreation.running) { root.cancel(); return }
            root.dragging=false; root.removeAt(root.hitIndex(event.x,event.y))
        }
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

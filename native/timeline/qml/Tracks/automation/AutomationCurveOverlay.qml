// nt-panel: slot=laneOverlay id=automationCurve order=100 title="Automation"
import QtQuick
import NodeTool.Timeline
import "automationTargets.js" as Targets
Item {
    id: root
    property TimelineModel timeline: null
    property var track: ({})
    property TimelineViewState viewState: null
    property ClipGestureController gestures: null
    readonly property var currentTrack: controller.channel.id ? controller.channel : track
    readonly property string shown: AutomationUIState.shownKey(currentTrack)
    readonly property var spec: Targets.automationTargetSpecs(currentTrack).find(s => s.key === shown) || null
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    Loader {
        anchors.fill: parent
        active: AutomationUIState.showAutomation && root.spec !== null
        sourceComponent: AutomationLaneView {
            timeline: root.timeline
            track: root.currentTrack
            lane: (root.currentTrack.automation || []).find(l => Targets.key(l.target) === root.shown) || {id:"shown:"+root.shown,target:root.spec.target,points:[]}
            mainLane: true
            msPerPx: root.viewState ? root.viewState.msPerPx : 10
            viewportLeft: root.viewState ? root.viewState.scrollLeftPx : 0
            viewportWidth: root.viewState ? root.viewState.viewportWidthPx : width
        }
    }
}

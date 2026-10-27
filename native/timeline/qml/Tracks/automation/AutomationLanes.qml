// nt-panel: slot=trackLane id=automationLanes order=10 title="Automation"
import QtQuick
import NodeTool.Timeline
import "automationLayout.js" as Layout
Item {
    id: root
    property TimelineModel timeline: null
    property var track: ({})
    readonly property var currentTrack: controller.channel.id ? controller.channel : track
    readonly property bool shown: AutomationUIState.shownAutomationTrackIds.includes(track.id)
    readonly property string laneKey: shown ? (currentTrack.automation || []).map(l => l.id).join("\u0000") : ""
    readonly property var laneIds: laneKey ? laneKey.split("\u0000") : []
    implicitHeight: Layout.automationSectionHeightPx(currentTrack, AutomationUIState.shownAutomationTrackIds)
    visible: shown
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    Column {
        width: parent.width
        Repeater {
            model: root.laneIds
            delegate: Item {
                required property var modelData
                readonly property var laneData: (root.currentTrack.automation || []).find(l => l.id === modelData) || {id:modelData,target:{},points:[]}
                width: root.width
                height: Layout.AUTOMATION_LANE_HEIGHT_PX
                AutomationLaneView {
                    anchors.fill: parent
                    timeline: root.timeline; track: root.currentTrack; lane: parent.laneData
                    msPerPx: AutomationUIState.viewState ? AutomationUIState.viewState.msPerPx : 10
                }
                AutomationLaneHeader {
                    x: (AutomationUIState.viewState ? AutomationUIState.viewState.scrollLeftPx : 0)
                       + Math.max(0, Math.min(root.width, AutomationUIState.viewState ? AutomationUIState.viewState.viewportWidthPx : root.width) - width)
                    width: Math.min(200, root.width); timeline: root.timeline; track: root.currentTrack; lane: parent.laneData
                }
            }
        }
        AutomationAddLaneHeader {
            x: AutomationUIState.viewState ? AutomationUIState.viewState.scrollLeftPx : 0
            width: Math.min(320,root.width); timeline: root.timeline; track: root.currentTrack
        }
    }
}

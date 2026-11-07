// nt-panel: slot=trackHeaderLane id=automationLaneHeaders order=10 title="Automation"
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
            delegate: AutomationLaneHeader {
                required property var modelData
                width: root.width
                timeline: root.timeline
                track: root.currentTrack
                lane: (root.currentTrack.automation || []).find(l => l.id === modelData) || {id:modelData,target:{},points:[]}
            }
        }
        AutomationAddLaneHeader {
            width: root.width
            timeline: root.timeline
            track: root.currentTrack
        }
    }
}

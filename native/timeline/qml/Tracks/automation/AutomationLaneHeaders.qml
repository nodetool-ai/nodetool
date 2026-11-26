pragma ComponentBehavior: Bound
// nt-panel: slot=trackHeaderLane id=automationLaneHeaders order=10 title="Automation"
import QtQuick
import NodeTool.Timeline
import "automationLayout.js" as Layout
import "automationTargets.js" as Targets
import NodeTool.UiPrimitives as Ui
Item {
    id: root
    property TimelineModel timeline: null
    // JSON data from the document, controller, or shared JavaScript API.
    property var track: ({})
    // JSON data from the document, controller, or shared JavaScript API.
    readonly property var currentTrack: controller.channel.id ? controller.channel : track
    readonly property bool shown: AutomationUIState.showAutomation && Targets.automationTargetSpecs(currentTrack).length > 0
    readonly property bool expanded: shown && AutomationUIState.shownAutomationTrackIds.includes(track.id)
    readonly property string laneKey: expanded ? AutomationUIState.subLanes(currentTrack).map(l => l.id).join("\u0000") : ""
    readonly property list<string> laneIds: laneKey ? laneKey.split("\u0000") : []
    implicitHeight: shown ? Ui.Metrics.standard + (expanded ? laneIds.length * Layout.AUTOMATION_LANE_HEIGHT_PX + Layout.AUTOMATION_FOOTER_HEIGHT_PX : 0) : 0
    visible: shown
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    Loader {
        width: parent.width
        active: root.shown
        sourceComponent: Column {
            width: root.width
            AutomationHeaderRow { width: root.width; timeline: root.timeline; track: root.currentTrack; height: Ui.Metrics.standard }
            Repeater {
                model: root.laneIds
                delegate: AutomationHeaderRow {
                    main: false
                    height: Layout.AUTOMATION_LANE_HEIGHT_PX
                    required property string modelData
                    width: root.width
                    timeline: root.timeline
                    track: root.currentTrack
                    lane: (root.currentTrack.automation || []).find(l => l.id === modelData) || {id:modelData,target:{},points:[]}
                }
            }
            AutomationAddLaneHeader {
                visible: root.expanded
                height: visible ? Layout.AUTOMATION_FOOTER_HEIGHT_PX : 0
                width: root.width
                timeline: root.timeline
                track: root.currentTrack
            }
        }
    }
}

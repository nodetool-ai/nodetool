pragma ComponentBehavior: Bound
// nt-panel: slot=trackLane id=automationLanes order=10 title="Automation"
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
    Column {
        width: parent.width
        Item { width: root.width; height: Ui.Metrics.standard }
        Repeater {
            model: root.laneIds
            delegate: Item {
                required property string modelData
                // JSON data from the document, controller, or shared JavaScript API.
                readonly property var laneData: (root.currentTrack.automation || []).find(l => l.id === modelData) || {id:modelData,target:{},points:[]}
                width: root.width
                height: Layout.AUTOMATION_LANE_HEIGHT_PX
                AutomationLaneView {
                    anchors.fill: parent
                    timeline: root.timeline; track: root.currentTrack; lane: parent.laneData
                    msPerPx: AutomationUIState.viewState ? AutomationUIState.viewState.msPerPx : 10
                    viewportLeft: AutomationUIState.viewState ? AutomationUIState.viewState.scrollLeftPx : 0
                    viewportWidth: AutomationUIState.viewState ? AutomationUIState.viewState.viewportWidthPx : width
                }
            }
        }
        Item {
            objectName: "automation-add-row-" + root.track.id
            width: root.width
            height: root.expanded ? Layout.AUTOMATION_FOOTER_HEIGHT_PX : 0
        }
    }
}

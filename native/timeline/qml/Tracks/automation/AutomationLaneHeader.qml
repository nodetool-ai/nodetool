import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import "automationTargets.js" as Targets
import NodeTool.UiPrimitives as Ui
Rectangle {
    id: root
    property TimelineModel timeline: null
    property var track: ({})
    property var lane: ({target:{}, points:[]})
    readonly property var spec: Targets.automationTargetSpec(track,lane.target)
    objectName: "automation-header-" + lane.id
    height: 56; color: Ui.Theme.surfacePanel
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    Column {
        x: Ui.Metrics.xl; anchors.verticalCenter: parent.verticalCenter
        width: parent.width - x - 2*Ui.Metrics.small - Ui.Metrics.sm
        Ui.Text { width: parent.width; elide: Text.ElideRight; text: root.spec ? root.spec.group : "Removed device"; role: Ui.Typography.SansCaption; tone: Ui.Text.Disabled }
        Ui.Text { width: parent.width; elide: Text.ElideRight; text: root.spec ? root.spec.label : Targets.key(root.lane.target); role: Ui.Typography.SansLabel; tone: root.lane.enabled !== false && root.spec ? Ui.Text.Primary : Ui.Text.Disabled }
    }
    Row {
        anchors.right: parent.right; anchors.rightMargin: Ui.Metrics.sm; anchors.verticalCenter: parent.verticalCenter
        Ui.ToolbarIconButton {
            objectName: "automation-power-" + root.lane.id
            iconName: "power"
            enabled: !root.track.locked
            accessibleName: root.lane.enabled === false ? "Turn lane on" : "Turn lane off"
            onClicked: controller.patchLane(root.lane.id, {enabled:root.lane.enabled === false})
        }
        Ui.ToolbarIconButton {
            objectName: "automation-remove-" + root.lane.id
            iconName: "close"
            enabled: !root.track.locked
            accessibleName: "Remove lane"
            onClicked: controller.patchLane(root.lane.id, {}, true)
        }
    }
    Ui.Separator { anchors.bottom: parent.bottom; width: parent.width }
}

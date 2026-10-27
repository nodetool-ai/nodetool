import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import "automationTargets.js" as Targets
Rectangle {
    id: root
    property TimelineModel timeline: null
    property var track: ({})
    property var lane: ({target:{}, points:[]})
    readonly property var spec: Targets.automationTargetSpec(track,lane.target)
    objectName: "automation-header-" + lane.id
    height: 56; color: Theme.backgroundPaper
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    Column {
        x: Theme.spacingXl; anchors.verticalCenter: parent.verticalCenter
        width: parent.width - x - 2*Theme.controlXs - Theme.spacingSm
        Text { width: parent.width; elide: Text.ElideRight; text: root.spec ? root.spec.group : "Removed device"; color: Theme.textDisabled; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller }
        Text { width: parent.width; elide: Text.ElideRight; text: root.spec ? root.spec.label : Targets.key(root.lane.target); color: root.lane.enabled !== false && root.spec ? Theme.textPrimary : Theme.textDisabled; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium }
    }
    Row {
        anchors.right: parent.right; anchors.rightMargin: Theme.spacingSm; anchors.verticalCenter: parent.verticalCenter
        Controls.ToolButton {
            objectName: "automation-power-" + root.lane.id
            palette.buttonText: Theme.textSecondary
            width: Theme.controlXs; height: Theme.controlXs; text: "⏻"; enabled: !root.track.locked
            Accessible.name: root.lane.enabled === false ? "Turn lane on" : "Turn lane off"
            onClicked: controller.patchLane(root.lane.id, {enabled:root.lane.enabled === false})
        }
        Controls.ToolButton {
            objectName: "automation-remove-" + root.lane.id
            palette.buttonText: Theme.textSecondary
            width: Theme.controlXs; height: Theme.controlXs; text: "×"; enabled: !root.track.locked
            Accessible.name: "Remove lane"
            onClicked: controller.patchLane(root.lane.id, {}, true)
        }
    }
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.divider }
}

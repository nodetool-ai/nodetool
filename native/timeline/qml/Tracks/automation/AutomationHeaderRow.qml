import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "automationTargets.js" as Targets
Item {
    id: root
    property TimelineModel timeline: null
    property var track: ({})
    property var lane: null
    property bool main: true
    readonly property var specs: Targets.automationTargetSpecs(track)
    readonly property string shown: main ? AutomationUIState.shownKey(track) : lane ? Targets.key(lane.target) : ""
    readonly property var spec: specs.find(s => s.key === shown) || null
    readonly property var activeLane: main ? (track.automation || []).find(l => Targets.key(l.target) === shown) : lane
    readonly property string mode: track.automationMode || "read"
    readonly property color parameterColor: spec ? Targets.color(Ui.Theme, controller.call("automationParamColorRole",[specs.findIndex(s => s.key === shown), spec.target])) : Ui.Theme.textDisabled
    readonly property color modeColor: ({off:Ui.Theme.textDisabled,read:Ui.Theme.statusSuccess,touch:Ui.Theme.statusWarning,latch:Ui.Theme.accentSecondary,write:Ui.Theme.statusError})[mode]
    objectName: (main ? "automation-row-" : "automation-header-") + (main ? track.id : lane ? lane.id : "")
    implicitHeight: Ui.Metrics.standard
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    AutomationReadout {
        id: reading
        timeline: root.timeline
        clock: root.visible && AutomationUIState.recorder ? AutomationUIState.recorder.clock : null
        trackId: root.track.id || ""
        target: root.spec ? root.spec.target : ({})
    }
    function choose(next) {
        if (main) { AutomationUIState.setShown(track.id,next.key); return }
        if (next.key === AutomationUIState.shownKey(track) || (track.automation || []).some(l => l.id !== lane.id && Targets.key(l.target) === next.key)) { return }
        const points = (lane.points || []).map(p => ({timeMs:p.timeMs,
            value:Targets.automationNormToValue(next,spec ? Targets.automationValueToNorm(spec,p.value) : .5),
            easing:p.easing || "linear"}))
        controller.patchLane(lane.id,{target:next.target,points:points})
    }
    Ui.ToolbarIconButton {
        id: disclosure
        visible: root.main
        width: Ui.Metrics.small
        anchors.verticalCenter: parent.verticalCenter
        iconName: AutomationUIState.shownAutomationTrackIds.includes(root.track.id) ? "expandMore" : "chevronRight"
        accessibleName: "Automation sub-lanes"
        onClicked: AutomationUIState.toggleTrackAutomation(root.track.id)
    }
    Ui.EditorButton {
        id: modeButton
        visible: root.main
        x: root.main ? disclosure.width : 0
        width: root.main ? Ui.Metrics.xxxl * 2 : 0
        density: Ui.EditorButton.Compact
        anchors.verticalCenter: parent.verticalCenter
        text: root.mode.charAt(0).toUpperCase() + root.mode.slice(1)
        enabled: !root.track.locked
        accessibleName: "Automation mode"
        onClicked: modeMenu.popup()
        Rectangle { anchors.fill: parent; color: root.modeColor; opacity: .12; z: Ui.Metrics.layerContent }
    }
    Ui.EditorButton {
        id: parameter
        objectName: "automation-parameter-" + (root.main ? root.track.id : root.lane ? root.lane.id : "")
        x: root.main ? modeButton.x + modeButton.width : Ui.Metrics.xs
        width: Math.max(Ui.Metrics.small, parent.width-x-valueLabel.width-Ui.Metrics.xs)
        anchors.verticalCenter: parent.verticalCenter
        density: Ui.EditorButton.Compact
        accessibleName: "Automation parameter: " + (root.spec ? root.spec.label : "Removed device")
        onClicked: parameterMenu.popup()
        Ui.Text {
            anchors.fill: parent
            anchors.margins: Ui.Metrics.xs
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
            role: Ui.Typography.SansCaption
            domainColor: root.parameterColor
            text: root.spec ? root.spec.label : "Removed device"
        }
    }
    Ui.Text {
        id: valueLabel
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.xs
        anchors.verticalCenter: parent.verticalCenter
        width: Ui.Metrics.xxxl * 2
        role: Ui.Typography.MonoCaption
        domainColor: root.parameterColor
        text: root.spec ? Targets.format(root.spec,reading.value) : ""
    }
    Ui.ContextMenu {
        id: modeMenu
        Repeater {
            model: ["off","read","touch","latch","write"]
            delegate: Ui.MenuItem {
                required property string modelData
                text: modelData.charAt(0).toUpperCase()+modelData.slice(1)
                checkable: true
                checked: root.mode === modelData
                onTriggered: controller.edit("setTrackAutomationMode",{mode:modelData})
            }
        }
    }
    Ui.ContextMenu {
        id: parameterMenu
        Repeater {
            model: root.specs
            delegate: Ui.MenuItem {
                required property var modelData
                readonly property bool populated: (root.track.automation || []).some(l => Targets.key(l.target) === modelData.key && l.points.length > 0)
                text: (populated ? "• " : "") + modelData.group + " · " + modelData.label
                enabled: root.main || (root.lane && !root.track.locked && modelData.key !== AutomationUIState.shownKey(root.track) && !(root.track.automation || []).some(l => l.id !== root.lane.id && Targets.key(l.target) === modelData.key))
                onTriggered: root.choose(modelData)
            }
        }
        Ui.MenuItem {
            objectName: "automation-power-" + (root.activeLane ? root.activeLane.id : "")
            visible: !!root.activeLane
            text: root.activeLane && root.activeLane.enabled === false ? "Enable lane" : "Disable lane"
            enabled: !root.track.locked
            onTriggered: controller.patchLane(root.activeLane.id,{enabled:root.activeLane.enabled === false})
        }
        Ui.MenuItem {
            objectName: "automation-remove-" + (root.activeLane ? root.activeLane.id : "")
            visible: !!root.activeLane
            text: "Remove lane"
            enabled: !root.track.locked
            onTriggered: controller.patchLane(root.activeLane.id,{},true)
        }
    }
}

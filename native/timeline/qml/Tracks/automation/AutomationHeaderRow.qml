pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "automationTargets.js" as Targets
Item {
    id: root
    property TimelineModel timeline: null
    // JSON data from the document, controller, or shared JavaScript API.
    property var track: ({})
    // JSON data from the document, controller, or shared JavaScript API.
    property var lane: null
    property bool main: true
    // JSON data from the document, controller, or shared JavaScript API.
    readonly property var specs: Targets.automationTargetSpecs(track)
    readonly property string shown: main ? AutomationUIState.shownKey(track) : lane ? Targets.key(lane.target) : ""
    // JSON data from the document, controller, or shared JavaScript API.
    readonly property var spec: specs.find(s => s.key === shown) || null
    // JSON data from the document, controller, or shared JavaScript API.
    readonly property var activeLane: main ? (track.automation || []).find(l => Targets.key(l.target) === shown) : lane
    readonly property string mode: track.automationMode || "read"
    readonly property color parameterColor: spec ? Targets.color(Ui.Theme, controller.call("automationParamColorRole",[specs.findIndex(s => s.key === shown), spec.target])) : Ui.Theme.textDisabled
    readonly property color modeColor: ({off:Ui.Theme.textDisabled,read:Ui.Theme.statusSuccess,touch:Ui.Theme.statusWarning,latch:Ui.Theme.accentSecondary,write:Ui.Theme.statusError})[mode]
    objectName: (main ? "automation-row-" : "automation-header-") + (main ? track.id : lane ? lane.id : "")
    implicitHeight: Ui.Metrics.standard
    // The parameter column starts at one x on the main row and every sub-lane row.
    readonly property real parameterX: Ui.Metrics.small + Ui.Metrics.xxxl * 2
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    // A sub-lane row is a raised strip with the parameter colour at its left edge.
    Rectangle {
        anchors.fill: parent
        visible: !root.main
        color: Ui.Theme.surfacePanel
        Rectangle {
            x: root.parameterX - Ui.Metrics.md
            width: Ui.Metrics.micro
            height: parent.height - 2 * Ui.Metrics.sm
            anchors.verticalCenter: parent.verticalCenter
            radius: Ui.Metrics.radiusControl
            color: root.parameterColor
            opacity: root.activeLane && root.activeLane.enabled === false ? 0.35 : 1
        }
        Ui.Separator { anchors.bottom: parent.bottom; width: parent.width }
    }
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
        const points = (lane.points || []).map(p => {
            const point = {timeMs:p.timeMs, value:spec
                ? Targets.automationNormToValue(next,Targets.automationValueToNorm(spec,p.value))
                : Math.max(next.min,Math.min(next.max,p.value))}
            if (p.easing && p.easing !== "linear") { point.easing = p.easing }
            return point
        })
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
        objectName: "automation-mode-" + (root.track.id || "")
        density: Ui.EditorButton.Compact
        variant: Ui.EditorButton.Flat
        anchors.verticalCenter: parent.verticalCenter
        enabled: !root.track.locked
        accessibleName: "Automation mode: " + modeLabel.text
        onClicked: modeMenu.popup()
        // The select fill carries the mode colour, as in Logic. Off stays a neutral field.
        Rectangle {
            id: modeFill
            objectName: "automation-mode-fill-" + (root.track.id || "")
            anchors.fill: parent
            anchors.margins: Ui.Metrics.micro
            radius: Ui.Metrics.radiusControl
            color: root.mode === "off" ? Ui.Theme.surfaceInput : root.modeColor
        }
        Ui.Text {
            id: modeLabel
            x: Ui.Metrics.sm
            anchors.verticalCenter: parent.verticalCenter
            role: Ui.Typography.SansCaption
            domainColor: root.mode === "off" ? Ui.Theme.textDisabled : Ui.Theme.surfaceCanvas
            text: root.mode.charAt(0).toUpperCase() + root.mode.slice(1)
        }
        Ui.Icon {
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.micro
            anchors.verticalCenter: parent.verticalCenter
            name: "arrowDropDown"
            size: Ui.Metrics.iconSm
            domainColor: modeLabel.color
        }
    }
    Ui.EditorButton {
        id: parameter
        objectName: "automation-parameter-" + (root.main ? root.track.id : root.lane ? root.lane.id : "")
        x: root.main ? modeButton.x + modeButton.width + Ui.Metrics.xs : root.parameterX
        width: Math.max(Ui.Metrics.small, parent.width-x-valueLabel.width-Ui.Metrics.sm)
        anchors.verticalCenter: parent.verticalCenter
        density: Ui.EditorButton.Compact
        variant: Ui.EditorButton.Flat
        accessibleName: "Automation parameter: " + (root.spec ? root.spec.label : "Removed device")
        onClicked: parameterMenu.openAt(parameter)
        Ui.Icon {
            anchors.right: parent.right
            anchors.rightMargin: Ui.Metrics.micro
            anchors.verticalCenter: parent.verticalCenter
            name: "arrowDropDown"
            size: Ui.Metrics.iconSm
            tone: Ui.Text.Secondary
        }
        // A lane with points shows a dot before the parameter name, as in the parameter list.
        Rectangle {
            id: dataDot
            objectName: "automation-data-dot-" + (root.main ? root.track.id : root.lane ? root.lane.id : "")
            visible: !!root.activeLane && (root.activeLane.points || []).length > 0
            x: Ui.Metrics.sm
            anchors.verticalCenter: parent.verticalCenter
            width: Ui.Metrics.xs
            height: width
            radius: Ui.Metrics.radiusPill
            color: root.parameterColor
        }
        Ui.Text {
            anchors.fill: parent
            anchors.leftMargin: dataDot.visible ? dataDot.x + dataDot.width + Ui.Metrics.xs : Ui.Metrics.sm
            anchors.rightMargin: Ui.Metrics.iconSm + Ui.Metrics.micro
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
        horizontalAlignment: Text.AlignRight
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
    Ui.Popover {
        id: parameterMenu
        width: parent ? Math.min(Ui.Metrics.dialogCompactWidth,parent.width) : Ui.Metrics.dialogCompactWidth
        height: Math.min(implicitHeight,parent ? parent.height : implicitHeight)
        onOpened: {
            parameterList.currentIndex=Math.max(0,root.specs.findIndex(s => s.key===root.shown))
            parameterList.positionViewAtIndex(parameterList.currentIndex,ListView.Contain)
            parameterList.forceActiveFocus()
        }
        contentItem: Column {
            ListView {
                id: parameterList
                width: parent.width
                height: Math.max(Ui.Metrics.comfortable,Math.min(Math.min(root.specs.length,8)*Ui.Metrics.comfortable,
                    parameterMenu.parent ? parameterMenu.parent.height-2*Ui.Metrics.md-(root.activeLane ? 2*Ui.Metrics.comfortable : 0) : Ui.Metrics.comfortable*8))
                implicitHeight: height
                model: root.specs
                reuseItems: true
                clip: true
                keyNavigationEnabled: true
                Keys.onReturnPressed: if (currentItem && currentItem.enabled) { currentItem.click() }
                Keys.onEnterPressed: if (currentItem && currentItem.enabled) { currentItem.click() }
                delegate: Ui.ListRow {
                    id: parameterChoice
                    // JSON record supplied by the delegate model.
                    required property var modelData
                    required property int index
                    readonly property bool populated: (root.track.automation || []).some(l => Targets.key(l.target)===modelData.key && l.points.length>0)
                    width: parameterList.width
                    height: Ui.Metrics.comfortable
                    active: ListView.isCurrentItem
                    accessibleName: modelData.group+" · "+modelData.label
                    text: (populated ? "• " : "")+accessibleName
                    enabled: root.main || (root.lane && !root.track.locked && modelData.key!==AutomationUIState.shownKey(root.track)
                        && !(root.track.automation || []).some(l => l.id!==root.lane.id && Targets.key(l.target)===modelData.key))
                    Ui.Text {
                        width: parent.width
                        anchors.verticalCenter: parent.verticalCenter
                        verticalAlignment: Text.AlignVCenter
                        elide: Text.ElideRight
                        role: Ui.Typography.SansCaption
                        domainColor: Targets.color(Ui.Theme,controller.call("automationParamColorRole",[index,modelData.target]))
                        text: parameterChoice.text
                    }
                    onClicked: { root.choose(modelData); parameterMenu.close() }
                }
            }
            Ui.ListRow {
                id: laneToggle
                height: Ui.Metrics.comfortable
                objectName: "automation-power-"+(root.activeLane ? root.activeLane.id : "")
                width: parent.width
                visible: !!root.activeLane
                enabled: !root.track.locked
                accessibleName: root.activeLane && root.activeLane.enabled===false ? "Enable lane" : "Disable lane"
                Ui.Text { width: parent.width; anchors.verticalCenter: parent.verticalCenter; role: Ui.Typography.SansCaption; text: laneToggle.accessibleName }
                onClicked: { controller.patchLane(root.activeLane.id,{enabled:root.activeLane.enabled===false}); parameterMenu.close() }
            }
            Ui.ListRow {
                id: laneRemove
                height: Ui.Metrics.comfortable
                objectName: "automation-remove-"+(root.activeLane ? root.activeLane.id : "")
                width: parent.width
                visible: !!root.activeLane
                enabled: !root.track.locked
                accessibleName: "Remove lane"
                Ui.Text { width: parent.width; anchors.verticalCenter: parent.verticalCenter; role: Ui.Typography.SansCaption; text: laneRemove.accessibleName }
                onClicked: { controller.patchLane(root.activeLane.id,{},true); parameterMenu.close() }
            }
        }
    }
}

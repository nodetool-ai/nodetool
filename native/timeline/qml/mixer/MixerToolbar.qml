// nt-panel: slot=toolbar id=mixerToggle order=100 title="Mixer"
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
Row {
    id: root
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    Binding { target: AutomationUIState; property: "timeline"; value: root.timeline }
    Binding { target: AutomationUIState; property: "viewState"; value: root.viewState }
    Controls.ToolButton {
        font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium
        palette.buttonText: Theme.textPrimary
        objectName: "mixer-toggle"; text: "Mixer"; checkable: true; checked: AutomationUIState.mixerOpen
        height: Theme.controlXs; onClicked: AutomationUIState.mixerOpen=!AutomationUIState.mixerOpen
    }
    Controls.ToolButton {
        font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium
        palette.buttonText: Theme.textPrimary
        objectName: "automation-toggle"; text: "Automation"; height: Theme.controlXs
        onClicked: automationMenu.open()
        Controls.Menu {
            palette.window: Theme.backgroundPaper; palette.windowText: Theme.textPrimary
            palette.base: Theme.backgroundDefault; palette.text: Theme.textPrimary
            palette.highlight: Theme.actionSelected; palette.highlightedText: Theme.textPrimary
            font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium
            id: automationMenu
            Repeater {
                model: controller.tracks.filter(t => ["audio","midi","video","overlay"].includes(t.type))
                delegate: Controls.MenuItem {
                    implicitHeight: 28
                    required property var modelData
                    text: modelData.name || modelData.id; checkable: true
                    checked: AutomationUIState.shownAutomationTrackIds.includes(modelData.id)
                    onTriggered: AutomationUIState.toggleTrackAutomation(modelData.id)
                }
            }
        }
    }
    AutomationController { id: controller; timeline: root.timeline }
}

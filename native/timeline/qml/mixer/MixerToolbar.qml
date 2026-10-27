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
}

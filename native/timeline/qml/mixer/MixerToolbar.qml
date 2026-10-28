// nt-panel: slot=toolbar id=mixerToggle order=100 title="Mixer"
import QtQuick
import NodeTool.Timeline
import "../Tracks" as Tracks
Row {
    id: root
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property bool compact: false
    Binding { target: AutomationUIState; property: "timeline"; value: root.timeline }
    Binding { target: AutomationUIState; property: "viewState"; value: root.viewState }
    Tracks.ToolButton {
        objectName: "mixer-toggle"
        label: "Mixer"
        iconPath: Icons.graphicEq
        active: AutomationUIState.mixerOpen
        compact: root.compact
        onClicked: AutomationUIState.mixerOpen=!AutomationUIState.mixerOpen
    }
}

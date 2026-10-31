// nt-panel: slot=toolbar id=mixerToggle order=100 title="Mixer"
import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Row {
    id: root
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property bool compact: false
    Binding { target: AutomationUIState; property: "timeline"; value: root.timeline }
    Binding { target: AutomationUIState; property: "viewState"; value: root.viewState }
    Ui.ToolbarIconButton {
        objectName: "mixer-toggle"
        property bool showLabel: !root.compact
        text: showLabel ? qsTr("Mixer") : ""
        accessibleName: qsTr("Mixer")
        display: showLabel ? Controls.AbstractButton.TextBesideIcon : Controls.AbstractButton.IconOnly
        iconName: "graphicEq"
        active: AutomationUIState.mixerOpen
        onClicked: AutomationUIState.mixerOpen=!AutomationUIState.mixerOpen
    }
}

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
        onClicked: {
            // In the docked editor the mixer is a tab, so the button brings that tab forward.
            let at = root.parent
            while (at && at.dockStore === undefined) at = at.parent
            if (at && at.dockStore) at.dockStore.dispatch({type: "reveal", panelId: "mixer"})
            else AutomationUIState.mixerOpen = !AutomationUIState.mixerOpen
        }
    }
}

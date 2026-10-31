// nt-panel: slot=bottom id=mixer order=100 title="Mixer"
import QtQuick
import NodeTool.Timeline
Item {
    id: root
    // PanelSlot supplies no timeline or width. The toolbar publishes the editor's bindings.
    readonly property var editor: {
        var at=parent
        while(at && at.timeline === undefined) at=at.parent
        return at
    }
    // A dock tab is open while it is shown, so only the undocked slot follows the toolbar toggle.
    readonly property bool docked: !!parent && !!parent.dock
    width: editor ? editor.width : 0
    implicitHeight: docked || AutomationUIState.mixerOpen ? 300 : 0
    visible: docked || AutomationUIState.mixerOpen
    MixerView { anchors.fill: parent; timeline: AutomationUIState.timeline }
}

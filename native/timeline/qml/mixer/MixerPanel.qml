pragma ComponentBehavior: Bound
// nt-panel: slot=bottom id=mixer order=100 title="Mixer"
import QtQuick
import NodeTool.Timeline
Item {
    id: root
    // PanelSlot supplies no timeline or width. The toolbar publishes the editor's bindings.
    readonly property Item editor: {
        for (let at = parent; at; at = at.parent) {
            if (at.timeline !== undefined) return at
        }
        return null
    }
    // A dock tab is open while it is shown, so only the undocked slot follows the toolbar toggle.
    readonly property bool docked: !!parent && !!parent.dock
    width: editor ? editor.width : 0
    implicitHeight: docked || AutomationUIState.mixerOpen ? 300 : 0
    visible: docked || AutomationUIState.mixerOpen
    MixerView { anchors.fill: parent; timeline: AutomationUIState.timeline }
}

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
    width: editor ? editor.width : 0
    implicitHeight: AutomationUIState.mixerOpen ? 300 : 0
    visible: AutomationUIState.mixerOpen
    MixerView { anchors.fill: parent; timeline: AutomationUIState.timeline }
}

import QtQuick
import NodeTool.Timeline

// Keep the loader and its visual ancestry stable. Only its geometry follows
// the dock slot, preserving panel state and the S1 panelSlot_* contract.
Loader {
    id: root
    property var dock: null
    property string panelId: ""
    readonly property var dockTarget: dock ? dock.panelSlot(panelId) : null
    readonly property rect dockRect: {
        if (!dockTarget || !parent) return Qt.rect(0, 0, 0, 0)
        const epoch = dock.geometryEpoch
        const point = parent.mapFromItem(dockTarget.item, 0, 0)
        return Qt.rect(point.x, point.y, dockTarget.item.width, dockTarget.item.height)
    }
    readonly property bool dockVisible: !!dockTarget && dockTarget.activePanelId === panelId
    clip: !!dock
    // A hidden panel keeps its last geometry: a window resize must not lay
    // out panels that do not show, such as a mixer with a strip per track.
    readonly property bool followsDock: !!dock && dockVisible
    Binding { target: root; property: "x"; when: root.followsDock; value: root.dockRect.x; restoreMode: Binding.RestoreNone }
    Binding { target: root; property: "y"; when: root.followsDock; value: root.dockRect.y; restoreMode: Binding.RestoreNone }
    Binding { target: root; property: "width"; when: root.followsDock; value: root.dockRect.width; restoreMode: Binding.RestoreNone }
    Binding { target: root; property: "height"; when: root.followsDock; value: root.dockRect.height; restoreMode: Binding.RestoreNone }
    Binding { target: root; property: "visible"; when: !!root.dock; value: root.dockVisible }
}

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
    Binding { target: root; property: "x"; when: !!root.dock; value: root.dockRect.x }
    Binding { target: root; property: "y"; when: !!root.dock; value: root.dockRect.y }
    Binding { target: root; property: "width"; when: !!root.dock; value: root.dockRect.width }
    Binding { target: root; property: "height"; when: !!root.dock; value: root.dockRect.height }
    Binding { target: root; property: "visible"; when: !!root.dock; value: root.dockVisible }
}

import QtQuick
import NodeTool.Timeline
import "DockLayout.js" as Model
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property DockLayoutStore store
    required property var registry
    required property var availableIds
    readonly property var layout: JSON.parse(JSON.stringify(store.layout))
    readonly property var sizes: store.displaySizes(width, height, layout.sizes)
    property var slots: ({})
    property int geometryEpoch: 0
    property string maximizedGroup: ""
    readonly property real emptyRegionExtent: Ui.Metrics.xl * 8
    property string dragPanel: ""
    property var dragTarget: null
    property int layoutEpoch: store.layoutEpoch
    // Session-only: a layout change, such as revealing a panel, shows the sides again.
    property bool leftCollapsed: false
    property bool rightCollapsed: false
    readonly property bool hasLeft: groups("left").length > 0
    readonly property bool hasRight: groups("right").length > 0
    // Animated fractions: 1 shows a side, maxT 1 fills the canvas with the maximized region.
    // Only these fractions animate, so a window resize or a handle drag stays immediate.
    property real leftShown: leftCollapsed ? 0 : 1
    property real rightShown: rightCollapsed ? 0 : 1
    property real maxT: maximizedGroup ? 1 : 0
    property string maximizedRegion: ""
    Behavior on leftShown { enabled: !Ui.Theme.reducedMotion; NumberAnimation { duration: Ui.Metrics.motionNormal; easing.type: Easing.OutCubic } }
    Behavior on rightShown { enabled: !Ui.Theme.reducedMotion; NumberAnimation { duration: Ui.Metrics.motionNormal; easing.type: Easing.OutCubic } }
    Behavior on maxT { enabled: !Ui.Theme.reducedMotion; NumberAnimation { duration: Ui.Metrics.motionNormal; easing.type: Easing.OutCubic } }
    onMaximizedGroupChanged: if (maximizedGroup) maximizedRegion = Model.regionOfGroup(layout, maximizedGroup) || ""
    readonly property bool hasLeftLayout: layout.regions.left.some(group => !!activePanel(group))
    readonly property bool hasRightLayout: layout.regions.right.some(group => !!activePanel(group))
    readonly property bool hasBottomLayout: layout.regions.bottom.some(group => !!activePanel(group))
    readonly property real leftExtent: hasLeftLayout ? sizes.left * leftShown : 0
    readonly property real rightExtent: hasRightLayout ? sizes.right * rightShown : 0
    readonly property real bottomExtent: hasBottomLayout ? sizes.bottom : 0
    readonly property real leftGap: hasLeftLayout ? Ui.Metrics.sm * leftShown : 0
    readonly property real rightGap: hasRightLayout ? Ui.Metrics.sm * rightShown : 0
    readonly property real bottomGap: bottomExtent ? Ui.Metrics.sm : 0
    function lerp(from, to) { return from + (to - from) * maxT }
    function maximizedTarget(region, normal, full) { return lerp(normal, maximizedRegion === region ? full : 0) }
    readonly property var visiblePanels: Model.allGroups(layout).filter(group => !maximizedGroup || group.id === maximizedGroup)
        .map(group => activePanel(group)).filter(id => !!id)
    objectName: "dockCanvas"
    clip: true
    onLayoutEpochChanged: { maximizedGroup = ""; leftCollapsed = false; rightCollapsed = false }
    onLayoutChanged: restoreMissingMaximizedGroup()
    onAvailableIdsChanged: restoreMissingMaximizedGroup()
    onXChanged: noteGeometry()
    onYChanged: noteGeometry()
    onWidthChanged: noteGeometry()
    onHeightChanged: noteGeometry()
    // One epoch step for each frame: the panel hosts then lay out their
    // panels one time, at the final geometry, not at each step between.
    function noteGeometry() { geometryTick.request() }
    DockPolishTick { id: geometryTick; onTick: ++root.geometryEpoch }
    readonly property var panelIcons: ({assets: "all", script: "subtitles", storyboard: "gridGoldenratio", inspector: "tune",
        activity: "recent", assistant: "autoAwesome", mixer: "graphicEq", source: "videocam", program: "movieOutlined", tracks: "layers"})
    function icon(id) { return panelIcons[id] || "" }
    function title(id) { const panel = registry.find(entry => entry.id === id); return panel ? panel.title : id }
    function shown(id) { return availableIds.indexOf(id) >= 0 && layout.hidden.indexOf(id) < 0 }
    function activePanel(group) {
        const eligible = group.panels.filter(id => shown(id))
        return eligible.indexOf(group.activePanelId) >= 0 ? group.activePanelId : (eligible[0] || "")
    }
    function groups(region) {
        return layout.regions[region].filter(group => !!activePanel(group) && (!maximizedGroup || group.id === maximizedGroup))
    }
    function registerSlot(id, item) {
        const next = ({})
        Object.keys(slots).forEach(key => { if (slots[key] && Model.regionOfGroup(layout, key)) next[key] = slots[key] })
        next[id] = item
        slots = next
    }
    function unregisterSlot(id, item) {
        if (slots[id] !== item) return
        const next = Object.assign({}, slots)
        delete next[id]
        slots = next
    }
    function panelSlot(id) {
        const group = Model.groupOfPanel(layout, id)
        if (!group || !slots[group.id] || !shown(id) || (maximizedGroup && group.id !== maximizedGroup)) return null
        return {item: slots[group.id], activePanelId: activePanel(group)}
    }
    function restoreMissingMaximizedGroup() {
        if (maximizedGroup && !Model.allGroups(layout).some(group => group.id === maximizedGroup && !!activePanel(group))) maximizedGroup = ""
    }
    function groupIdOfPanel(id) { const group = Model.groupOfPanel(layout, id); return group ? group.id : "" }
    function activePanelOfGroup(id) {
        const group = Model.allGroups(layout).find(entry => entry.id === id)
        return group ? activePanel(group) : ""
    }
    // The group that holds an item, found by place, because the Program and
    // Timeline panels are not visual children of their groups.
    function groupIdAt(item) {
        if (!item) return ""
        const center = item.mapToItem(root, item.width / 2, item.height / 2)
        for (const id of Object.keys(slots)) {
            const group = slots[id] ? slots[id].groupView : null
            if (!group || !Model.regionOfGroup(layout, id)) continue
            const local = group.mapFromItem(root, center.x, center.y)
            if (local.x >= 0 && local.y >= 0 && local.x <= group.width && local.y <= group.height) return id
        }
        return ""
    }
    // Shows a panel, and shows its side again or leaves a maximized group when
    // either would hide it. False for a panel with nothing to show.
    function revealPanel(id) {
        if (availableIds.indexOf(id) < 0) return false
        store.dispatch({type: "reveal", panelId: id})
        const groupId = groupIdOfPanel(id)
        const region = Model.regionOfGroup(layout, groupId)
        if (region === "left") leftCollapsed = false
        if (region === "right") rightCollapsed = false
        if (maximizedGroup && groupId !== maximizedGroup) maximizedGroup = ""
        return true
    }
    function focusPanelTab(id) {
        const slot = slots[groupIdOfPanel(id)]
        if (slot && slot.groupView) slot.groupView.focusTabOf(id)
    }
    function toggleSide(side) { if (side === "left") leftCollapsed = !leftCollapsed; else if (side === "right") rightCollapsed = !rightCollapsed }
    function toggleMaximize(id) { maximizedGroup = maximizedGroup ? "" : id }
    function moveToRegion(id, region) { store.dispatch(Model.dockMoveToRegion(layout, id, region)) }
    function dropPanel(id, target) {
        const action = Model.dockDropAction(layout, id, target, availableIds)
        if (action) store.dispatch(action)
    }
    function beginDrag(id) { dragPanel = id; dragTarget = null }
    function cancelDrag() { dragPanel = ""; dragTarget = null }
    function finishDrag() {
        const id = dragPanel, target = dragTarget
        cancelDrag()
        if (id && target) dropPanel(id, target)
    }
    function updateDrag(x, y) {
        dragTarget = null
        if (x < 0 || y < 0 || x > width || y > height) return
        for (const region of ["left", "right", "bottom"]) {
            if (!groups(region).length && (region === "left" ? x < emptyRegionExtent : region === "right" ? x > width - emptyRegionExtent : y > height - emptyRegionExtent)) {
                dragTarget = {kind: "region", region}
                return
            }
        }
        for (const id of Object.keys(slots)) {
            const slot = slots[id]
            if (!slot || !Model.regionOfGroup(layout, id)) continue
            const group = slot.groupView
            const local = group.mapFromItem(root, x, y)
            if (local.x < 0 || local.y < 0 || local.x > group.width || local.y > group.height) continue
            if (local.y < TimelineMetrics.rulerHeight) {
                dragTarget = {kind: "tab", region: group.region, groupId: id, index: group.tabTarget(local.x, dragPanel)}
            } else {
                const body = slot.mapFromItem(root, x, y)
                const vertical = group.region === "left" || group.region === "right"
                const fraction = vertical ? body.y / slot.height : body.x / slot.width
                const zone = fraction < 0.28 ? (vertical ? "top" : "left") : fraction > 0.72 ? (vertical ? "bottom" : "right") : "center"
                dragTarget = {kind: "zone", region: group.region, groupId: id, zone}
            }
            return
        }
    }
    Keys.onEscapePressed: event => {
        if (dragPanel) cancelDrag()
        else event.accepted = false
    }
    DockRegionView {
        dock: root; region: "left"
        z: root.maxT > 0 && !(root.maximizedRegion === "left") ? -TimelineMetrics.dockMaximizedLayer : 0
        width: root.maximizedTarget("left", root.leftExtent, root.width)
        height: root.height
    }
    DockRegionView {
        dock: root; region: "right"
        z: root.maxT > 0 && !(root.maximizedRegion === "right") ? -TimelineMetrics.dockMaximizedLayer : 0
        width: root.maximizedTarget("right", root.rightExtent, root.width)
        x: root.width - width
        height: root.height
    }
    Item {
        id: center
        readonly property bool holdsMaximized: root.maximizedRegion === "viewport" || root.maximizedRegion === "bottom"
        onXChanged: root.noteGeometry()
        onYChanged: root.noteGeometry()
        z: root.maxT > 0 && !(holdsMaximized) ? -TimelineMetrics.dockMaximizedLayer : 0
        x: root.lerp(root.leftExtent + root.leftGap, holdsMaximized ? 0 : root.leftExtent + root.leftGap)
        width: root.lerp(Math.max(0, root.width - root.leftExtent - root.leftGap - root.rightExtent - root.rightGap),
                         holdsMaximized ? root.width : 0)
        height: root.height
        DockRegionView {
            dock: root; region: "viewport"
            width: center.width
            height: root.maximizedTarget("viewport", Math.max(0, root.height - root.bottomExtent - root.bottomGap), root.height)
        }
        DockRegionView {
            dock: root; region: "bottom"
            height: root.maximizedTarget("bottom", root.bottomExtent, root.height)
            y: root.height - height
            width: center.width
        }
        DockResizeHandle {
            objectName: "dockResize_bottom"
            visible: !root.maximizedGroup && root.bottomExtent > 0
            x: 0; y: root.height - root.bottomExtent - height
            width: center.width; height: Ui.Metrics.sm
            vertical: false; invert: true
            value: root.bottomExtent
            minimum: 80; maximum: Math.max(80, Math.min(1000, root.height * 0.75))
            label: "Resize timeline bottom dock panels"
            onResizeStarted: root.store.beginResize()
            onResizeFinished: canceled => root.store.finishResize(canceled)
            onResizeRequested: next => root.store.resizeRegion("bottom", next, root.width, root.height)
        }
    }
    Repeater {
        model: ["left", "right"]
        delegate: DockResizeHandle {
            required property string modelData
            objectName: "dockResize_" + modelData
            visible: !root.maximizedGroup && (modelData === "left" ? root.leftExtent : root.rightExtent) > 0
            x: modelData === "left" ? root.leftExtent : root.width - root.rightExtent - width
            width: Ui.Metrics.sm; height: root.height
            invert: modelData === "right"
            value: modelData === "left" ? root.leftExtent : root.rightExtent
            maximum: Math.max(100, Math.min(1600, root.width / 3))
            label: "Resize timeline " + modelData + " dock panels"
            onResizeStarted: root.store.beginResize()
            onResizeFinished: canceled => root.store.finishResize(canceled)
            onResizeRequested: next => root.store.resizeRegion(modelData, next, root.width, root.height)
        }
    }
    Rectangle {
        visible: !!root.dragTarget
        z: TimelineMetrics.dockDropLayer
        color: Ui.Theme.actionSelected
        border.color: Ui.Theme.accentPrimary
        border.width: Ui.Metrics.micro
        property var slot: root.dragTarget && root.dragTarget.groupId ? root.slots[root.dragTarget.groupId] : null
        property point point: slot ? root.mapFromItem(slot, 0, 0) : Qt.point(0, 0)
        property string zone: root.dragTarget && root.dragTarget.zone ? root.dragTarget.zone : "center"
        property real fullWidth: slot ? slot.width : root.dragTarget && root.dragTarget.region === "bottom" ? root.width : root.emptyRegionExtent
        property real fullHeight: slot ? slot.height : root.dragTarget && root.dragTarget.region === "bottom" ? root.emptyRegionExtent : root.height
        x: slot ? point.x + (zone === "right" ? fullWidth / 2 : 0) : root.dragTarget && root.dragTarget.region === "right" ? root.width - width : 0
        y: slot ? point.y + (zone === "bottom" ? fullHeight / 2 : 0) : root.dragTarget && root.dragTarget.region === "bottom" ? root.height - height : 0
        width: zone === "left" || zone === "right" ? fullWidth / 2 : fullWidth
        height: zone === "top" || zone === "bottom" ? fullHeight / 2 : fullHeight
    }
}

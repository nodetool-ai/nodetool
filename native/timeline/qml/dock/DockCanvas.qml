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
    readonly property real leftExtent: hasLeft && !leftCollapsed ? sizes.left : 0
    readonly property real rightExtent: hasRight && !rightCollapsed ? sizes.right : 0
    readonly property real bottomExtent: groups("bottom").length ? sizes.bottom : 0
    readonly property real leftGap: leftExtent ? Ui.Metrics.sm : 0
    readonly property real rightGap: rightExtent ? Ui.Metrics.sm : 0
    readonly property real bottomGap: bottomExtent ? Ui.Metrics.sm : 0
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
    function noteGeometry() { ++geometryEpoch }
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
    Keys.onEscapePressed: if (dragPanel) cancelDrag()
    DockRegionView {
        dock: root; region: "left"
        width: root.maximizedGroup && root.groups("left").length ? root.width : root.leftExtent
        height: root.height
    }
    DockRegionView {
        dock: root; region: "right"
        x: root.maximizedGroup ? 0 : root.width - root.rightExtent
        width: root.maximizedGroup && root.groups("right").length ? root.width : root.rightExtent
        height: root.height
    }
    Item {
        id: center
        onXChanged: root.noteGeometry()
        onYChanged: root.noteGeometry()
        x: root.maximizedGroup ? 0 : root.leftExtent + root.leftGap
        width: root.maximizedGroup ? root.width : Math.max(0, root.width - x - root.rightExtent - root.rightGap)
        height: root.height
        DockRegionView {
            dock: root; region: "viewport"
            width: center.width
            height: root.maximizedGroup ? root.height : Math.max(0, root.height - root.bottomExtent - root.bottomGap)
        }
        DockRegionView {
            dock: root; region: "bottom"
            y: root.maximizedGroup ? 0 : root.height - root.bottomExtent
            width: center.width
            height: root.maximizedGroup && root.groups("bottom").length ? root.height : root.bottomExtent
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

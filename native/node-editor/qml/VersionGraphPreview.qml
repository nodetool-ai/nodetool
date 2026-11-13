import QtQuick
import NodeTool.UiPrimitives as Ui
Rectangle {
    id: root
    required property var graph
    // An interactive preview pans by dragging and zooms with the wheel, as the web's
    // WorkflowGraphPreview does through ReactFlow. Thumbnails stay fixed.
    property bool interactive: false
    // A comparison draws instead of a plain graph: `graph` is the newer side, `oldGraph` the older,
    // and `diff` the result of WorkflowVersions::graphDiff. The styling follows
    // web/src/components/version/GraphVisualDiff.tsx: added nodes and connections in the success
    // colour, removed ones in the error colour at reduced opacity (connections dashed), changed
    // nodes in the warning colour and unchanged ones muted.
    property var diff: undefined
    property var oldGraph: ({})
    readonly property bool diffMode: hasDiff()
    readonly property bool diffEmpty: diffMode && !diff.hasChanges
    // Zoom limits from web/src/components/version/WorkflowGraphPreview.tsx.
    readonly property real minZoom: 0.02
    readonly property real maxZoom: 1.5
    // Zoom per wheel angle unit, the base-two exponent d3-zoom uses for wheel input.
    readonly property real wheelZoomRate: 0.002
    // Screen scale and the translation of the graph origin, in item coordinates.
    property real viewScale: 1
    property real viewX: 0
    property real viewY: 0
    property bool viewTouched: false
    readonly property real nodeWidth: Ui.Metrics.touch * 3
    readonly property real nodeHeight: Ui.Metrics.touch
    // The legend counts changed nodes, as the web's corner counters do.
    readonly property var legend: diffMode ? [
        {status: "added", count: (diff.addedNodes || []).length},
        {status: "removed", count: (diff.removedNodes || []).length},
        {status: "modified", count: (diff.modifiedNodes || []).length}
    ].filter(entry => entry.count > 0) : []
    color: Ui.Theme.surfaceInput
    border.color: Ui.Theme.borderSubtle
    border.width: Ui.Metrics.border
    clip: true
    // Change handlers run before dependent bindings update, so they test the property itself.
    function hasDiff() {
        return diff !== undefined && diff !== null
    }
    function statusColor(status) {
        return status === "added" ? Ui.Theme.statusSuccess : status === "removed" ? Ui.Theme.statusError : Ui.Theme.statusWarning
    }
    // Text on a status fill: the web uses white on error and the palette's contrast colour elsewhere.
    function onStatusColor(status) {
        const fill = statusColor(status)
        return status === "removed" || fill.hslLightness < 0.5 ? Ui.Theme.textOnAccent : Ui.Theme.surfaceCanvas
    }
    function nodeLabel(node) {
        const parts = (node.type || "").split(".")
        return parts[parts.length - 1] || "Node"
    }
    function buildLayout(source) {
        const nodes = source.nodes || []
        const positions = {}
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        nodes.forEach((node, index) => {
            const position = (node.ui_properties || {}).position || node.position || {x: index * nodeWidth, y: 0}
            positions[node.id] = position
            minX = Math.min(minX, position.x)
            minY = Math.min(minY, position.y)
            maxX = Math.max(maxX, position.x + nodeWidth)
            maxY = Math.max(maxY, position.y + nodeHeight)
        })
        return {positions: positions, minX: minX, minY: minY, maxX: maxX, maxY: maxY}
    }
    // GraphVisualDiff lays every node of both graphs on a grid, newer graph first, then the nodes
    // only the older graph has. A node's status comes from the diff.
    function buildDiffLayout() {
        const status = {}
        ;(diff.addedNodes || []).forEach(node => { status[node.id] = "added" })
        ;(diff.removedNodes || []).forEach(node => { status[node.id] = "removed" })
        ;(diff.modifiedNodes || []).forEach(node => { status[node.id] = "modified" })
        const current = graph.nodes || []
        const previous = oldGraph.nodes || []
        const order = []
        const byId = {}
        current.concat(previous).forEach(node => {
            if (!(node.id in byId)) {
                order.push(node.id)
            }
            byId[node.id] = node
        })
        const columns = Math.max(1, Math.ceil(Math.sqrt(Math.max(current.length, previous.length))))
        const gap = Ui.Metrics.md
        const positions = {}
        const nodes = order.map((id, index) => {
            const position = {x: (index % columns) * (nodeWidth + gap), y: Math.floor(index / columns) * (nodeHeight + gap)}
            positions[id] = position
            return {id: id, type: byId[id].type, status: status[id] || "unchanged"}
        })
        const keyOf = edge => edge.source + ":" + edge.target
        const oldKeys = new Set((oldGraph.edges || []).map(keyOf))
        const newKeys = new Set((graph.edges || []).map(keyOf))
        const edges = (graph.edges || []).map(edge => ({source: edge.source, target: edge.target, status: oldKeys.has(keyOf(edge)) ? "unchanged" : "added"}))
        ;(oldGraph.edges || []).forEach(edge => {
            if (!newKeys.has(keyOf(edge))) {
                edges.push({source: edge.source, target: edge.target, status: "removed"})
            }
        })
        let maxX = 0
        let maxY = 0
        order.forEach(id => {
            maxX = Math.max(maxX, positions[id].x + nodeWidth)
            maxY = Math.max(maxY, positions[id].y + nodeHeight)
        })
        return {nodes: nodes, edges: edges, positions: positions, minX: 0, minY: 0, maxX: maxX, maxY: maxY}
    }
    function fit() {
        const diffing = hasDiff()
        const bounds = diffing ? buildDiffLayout() : buildLayout(root.graph)
        const count = diffing ? bounds.nodes.length : (root.graph.nodes || []).length
        if (!count || width <= 0 || height <= 0 || (diffing && !diff.hasChanges)) {
            return
        }
        const margin = Ui.Metrics.xl
        const fitted = Math.min((width - margin * 2) / (bounds.maxX - bounds.minX), (height - margin * 2) / (bounds.maxY - bounds.minY))
        viewScale = Math.max(minZoom, Math.min(maxZoom, fitted))
        viewX = (width - (bounds.maxX - bounds.minX) * viewScale) / 2 - bounds.minX * viewScale
        viewY = (height - (bounds.maxY - bounds.minY) * viewScale) / 2 - bounds.minY * viewScale
        viewTouched = false
    }
    function zoomAt(delta, x, y) {
        const next = Math.max(minZoom, Math.min(maxZoom, viewScale * Math.pow(2, delta * wheelZoomRate)))
        const ratio = next / viewScale
        viewX = x - (x - viewX) * ratio
        viewY = y - (y - viewY) * ratio
        viewScale = next
        viewTouched = true
    }
    onGraphChanged: fit()
    onDiffChanged: fit()
    onOldGraphChanged: fit()
    onWidthChanged: if (!viewTouched) fit()
    onHeightChanged: if (!viewTouched) fit()
    Component.onCompleted: fit()
    Canvas {
        id: canvas
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        Connections {
            target: root
            function onViewScaleChanged() { canvas.requestPaint() }
            function onViewXChanged() { canvas.requestPaint() }
            function onViewYChanged() { canvas.requestPaint() }
            function onGraphChanged() { canvas.requestPaint() }
            function onDiffChanged() { canvas.requestPaint() }
            function onOldGraphChanged() { canvas.requestPaint() }
        }
        Connections {
            target: Ui.Theme
            function onDarkChanged() { canvas.requestPaint() }
        }
        function paintDiff(c) {
            const layout = root.buildDiffLayout()
            const positions = layout.positions
            const nw = root.nodeWidth
            const nh = root.nodeHeight
            const line = Ui.Metrics.border / root.viewScale
            c.setTransform(root.viewScale, 0, 0, root.viewScale, root.viewX, root.viewY)
            layout.edges.forEach(edge => {
                const a = positions[edge.source]
                const b = positions[edge.target]
                if (!a || !b) {
                    return
                }
                const changed = edge.status !== "unchanged"
                c.strokeStyle = edge.status === "unchanged" ? Ui.Theme.textDisabled : root.statusColor(edge.status)
                c.globalAlpha = edge.status === "removed" ? 0.4 : 1
                c.lineWidth = line * (changed ? 2 : 1)
                c.setLineDash(edge.status === "removed" ? [Ui.Metrics.xs / root.viewScale, Ui.Metrics.micro / root.viewScale] : [])
                c.beginPath()
                c.moveTo(a.x + nw / 2, a.y + nh / 2)
                c.lineTo(b.x + nw / 2, b.y + nh / 2)
                c.stroke()
            })
            c.setLineDash([])
            c.globalAlpha = 1
            c.font = Ui.Typography.pixelSize(Ui.Typography.SansCaption) + "px " + Ui.Typography.family(Ui.Typography.SansCaption)
            c.textAlign = "center"
            layout.nodes.forEach(node => {
                const p = positions[node.id]
                const changed = node.status !== "unchanged"
                const fill = changed ? root.statusColor(node.status) : Ui.Theme.actionSelected
                const edge = changed ? Qt.darker(fill, 1.4) : Ui.Theme.borderSubtle
                c.globalAlpha = node.status === "removed" ? 0.5 : 1
                c.fillStyle = fill
                c.strokeStyle = edge
                c.lineWidth = line * (changed ? 2 : 1)
                c.beginPath()
                c.roundedRect(p.x, p.y, nw, nh, Ui.Metrics.xs, Ui.Metrics.xs)
                c.fill()
                c.stroke()
                c.fillStyle = changed ? root.onStatusColor(node.status) : Ui.Theme.textSecondary
                c.fillText(root.nodeLabel(node), p.x + nw / 2, p.y + nh / 2, nw - Ui.Metrics.xl)
                if (changed) {
                    // The corner dot that marks a changed node in the web.
                    c.fillStyle = edge
                    c.beginPath()
                    c.arc(p.x + nw, p.y, Ui.Metrics.xs, 0, Math.PI * 2)
                    c.fill()
                }
            })
            c.globalAlpha = 1
        }
        onPaint: {
            const c = getContext("2d")
            c.reset()
            if (root.hasDiff()) {
                if (root.diff.hasChanges) {
                    paintDiff(c)
                }
                return
            }
            const nodes = root.graph.nodes || []
            const edges = root.graph.edges || []
            if (!nodes.length) {
                return
            }
            const positions = root.buildLayout(root.graph).positions
            const nw = root.nodeWidth
            const nh = root.nodeHeight
            c.setTransform(root.viewScale, 0, 0, root.viewScale, root.viewX, root.viewY)
            c.strokeStyle = Ui.Theme.textSecondary
            c.lineWidth = Ui.Metrics.border / root.viewScale
            edges.forEach(edge => {
                const a = positions[edge.source]
                const b = positions[edge.target]
                if (a && b) {
                    c.beginPath()
                    c.moveTo(a.x + nw, a.y + nh / 2)
                    c.lineTo(b.x, b.y + nh / 2)
                    c.stroke()
                }
            })
            c.font = Ui.Typography.pixelSize(Ui.Typography.SansCaption) + "px " + Ui.Typography.family(Ui.Typography.SansCaption)
            nodes.forEach(node => {
                const p = positions[node.id]
                c.fillStyle = Ui.Theme.surfacePanel
                c.fillRect(p.x, p.y, nw, nh)
                c.strokeRect(p.x, p.y, nw, nh)
                c.fillStyle = Ui.Theme.textPrimary
                c.fillText(root.nodeLabel(node), p.x + Ui.Metrics.md, p.y + nh / 2, nw - Ui.Metrics.xl)
            })
        }
    }
    DragHandler {
        id: pan
        enabled: root.interactive
        target: null
        property real startX: 0
        property real startY: 0
        onActiveChanged: {
            if (active) {
                startX = root.viewX
                startY = root.viewY
                root.viewTouched = true
            }
        }
        onTranslationChanged: {
            if (active) {
                root.viewX = startX + translation.x
                root.viewY = startY + translation.y
            }
        }
    }
    WheelHandler {
        enabled: root.interactive
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onWheel: event => root.zoomAt(event.angleDelta.y, point.position.x, point.position.y)
    }
    Ui.Text {
        objectName: "preview-empty"
        anchors.centerIn: parent
        visible: root.diffMode ? root.diffEmpty : !(root.graph.nodes || []).length
        text: root.diffMode ? "No changes to display" : "Empty workflow"
        role: Ui.Typography.SansCaption
    }
    Column {
        objectName: "diff-legend"
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: Ui.Metrics.xs
        spacing: Ui.Metrics.micro
        visible: root.legend.length > 0 && !root.diffEmpty
        Repeater {
            model: root.legend
            Row {
                id: entry
                required property var modelData
                spacing: Ui.Metrics.xs
                layoutDirection: Qt.RightToLeft
                Rectangle {
                    width: Ui.Metrics.md
                    height: Ui.Metrics.md
                    radius: Ui.Metrics.radiusPill
                    color: root.statusColor(entry.modelData.status)
                    anchors.verticalCenter: parent.verticalCenter
                }
                Ui.Text {
                    text: entry.modelData.count
                    role: Ui.Typography.SansCaption
                    anchors.verticalCenter: parent.verticalCenter
                }
            }
        }
    }
}

// nt-panel: slot=preview id=effectMasks order=20 title="Effect masks"
// Edits the effect mask selected in Effect Controls or the Color panel on the Program monitor.
// Drag a vertex or a Bézier handle to reshape, drag inside to move, drag the feather and
// expansion handles above the path. Ctrl-click on the path adds a vertex, Alt-click a vertex
// deletes it, double-click converts it between corner and smooth. Shift-click or a marquee
// selects several vertices, which then move together. With the pen, each click places a vertex.
// Click the first vertex or press Enter to close the path, Escape to stop.
// Each drag or click is one undo entry.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Shapes
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../../src/edit/clipeffects" as ClipFx
import "../../src/edit/clipeffects/EffectMaskEdits.js" as MaskEdits

Item {
    id: overlay
    objectName: "effectMaskOverlay"
    required property TimelineModel timeline
    required property PlaybackClock clock
    readonly property string clipId: ClipEffectsUi.maskClipId
    readonly property string effectId: ClipEffectsUi.maskEffectId
    readonly property bool pen: ClipEffectsUi.maskPen
    readonly property var effect: (inspector.clip.effects || []).find(effect => effect.id === effectId) || null
    readonly property var masks: effect ? (effect.masks || []) : []
    readonly property var mask: MaskEdits.find(masks, ClipEffectsUi.maskId)
    readonly property var corners: gizmo.clipCorners
    readonly property bool mapped: corners.length === 4 && gizmo.selection.length === 1 && gizmo.selection[0] === clipId
    readonly property bool active: mapped && !!effect && (!!mask || pen)
    property var selectedVertices: []
    visible: active
    // Picture axes of the clip on screen: origin at its top-left, u along the top, v down the left.
    readonly property point origin: mapped ? corners[0] : Qt.point(0, 0)
    readonly property point uAxis: mapped ? Qt.point(corners[1].x - corners[0].x, corners[1].y - corners[0].y) : Qt.point(1, 0)
    readonly property point vAxis: mapped ? Qt.point(corners[3].x - corners[0].x, corners[3].y - corners[0].y) : Qt.point(0, 1)
    readonly property real clipShorter: Math.min(Math.hypot(uAxis.x, uAxis.y), Math.hypot(vAxis.x, vAxis.y))
    function toScreen(x, y) { return Qt.point(origin.x + uAxis.x * x + vAxis.x * y, origin.y + uAxis.y * x + vAxis.y * y) }
    function toClip(px, py) {
        const det = uAxis.x * vAxis.y - uAxis.y * vAxis.x;
        if (Math.abs(det) < 1e-9) return Qt.point(0, 0);
        const dx = px - origin.x, dy = py - origin.y;
        return Qt.point((dx * vAxis.y - dy * vAxis.x) / det, (uAxis.x * dy - uAxis.y * dx) / det);
    }
    // A clip delta for a screen delta.
    function clipDelta(dx, dy) {
        const a = toClip(dx + origin.x, dy + origin.y);
        return Qt.point(a.x, a.y);
    }
    onClipIdChanged: selectedVertices = []
    onEffectIdChanged: selectedVertices = []
    TransformGizmoController {
        id: gizmo
        objectName: "effectMaskGizmo"
        visible: false
        anchors.fill: parent
        Component.onCompleted: Qt.callLater(discover)
    }
    ClipInspectorController {
        id: inspector
        timeline: overlay.timeline
        clock: overlay.clock
        clipId: overlay.clipId
    }
    ClipFx.ClipEffectsEdits {
        id: edits
        timelineModel: inspector.timeline
        controller: inspector
    }
    function write(next, phase) { edits.patch(effectId, {masks: next.length > 0 ? next : undefined}, phase) }
    // The feather and expansion handles sit above the path's top edge, one ramp width apart.
    readonly property var maskBounds: mask && mask.vertices.length > 0 ? MaskEdits.bounds(mask) : null
    readonly property point featherHandle: maskBounds ? toScreen(maskBounds.cx, maskBounds.y - (mask.feather || 0) * clipShorter / Math.max(1, Math.hypot(vAxis.x, vAxis.y)) - handleGap()) : Qt.point(0, 0)
    readonly property point expansionHandle: maskBounds ? toScreen(maskBounds.cx + (mask.expansion || 0) * clipShorter / Math.max(1, Math.hypot(uAxis.x, uAxis.y)) + handleGap() * 2, maskBounds.y - handleGap()) : Qt.point(0, 0)
    function handleGap() { return Ui.Metrics.lg / Math.max(1, Math.hypot(vAxis.x, vAxis.y)) }
    Shape {
        anchors.fill: parent
        visible: overlay.active && !!overlay.mask
        preferredRendererType: Shape.CurveRenderer
        ShapePath {
            strokeColor: Ui.Theme.statusWarning
            strokeWidth: Ui.Metrics.border
            fillColor: "transparent"
            PathPolyline {
                path: {
                    if (!overlay.mask || overlay.mask.vertices.length < 2) return [];
                    const points = MaskEdits.outline(overlay.mask).map(p => overlay.toScreen(p.x, p.y));
                    points.push(points[0]);
                    return points;
                }
            }
        }
        ShapePath {
            strokeColor: Ui.Theme.textSecondary
            strokeWidth: Ui.Metrics.border
            fillColor: "transparent"
            PathPolyline {
                // The pen's open path, before it is closed.
                path: overlay.mask && overlay.mask.vertices.length === 1 ? [overlay.toScreen(overlay.mask.vertices[0].x, overlay.mask.vertices[0].y), overlay.toScreen(overlay.mask.vertices[0].x, overlay.mask.vertices[0].y)] : []
            }
        }
    }
    Rectangle {
        id: marqueeBox
        visible: false
        color: "transparent"
        border.color: Ui.Theme.statusWarning
        border.width: Ui.Metrics.border
    }
    // One pointer target for the whole overlay keeps hit-testing in one place.
    MouseArea {
        id: pointer
        objectName: "effectMaskPointer"
        anchors.fill: parent
        enabled: overlay.active && !edits.locked
        acceptedButtons: Qt.LeftButton
        hoverEnabled: true
        focus: overlay.active
        property string target: ""
        property int vertex: -1
        property point last
        property point pressPoint
        property bool moved: false
        readonly property real hitRadius: Ui.Metrics.sm
        function hit(x, y) {
            const m = overlay.mask;
            if (!m) return {target: ""};
            const near = p => Math.hypot(p.x - x, p.y - y) <= hitRadius;
            if (near(overlay.featherHandle)) return {target: "feather"};
            if (near(overlay.expansionHandle)) return {target: "expansion"};
            for (let i = 0; i < m.vertices.length; ++i) {
                const v = m.vertices[i];
                if (overlay.selectedVertices.indexOf(i) >= 0 || overlay.selectedVertices.length === 0) {
                    if (v.inX || v.inY) { if (near(overlay.toScreen(v.x + v.inX, v.y + (v.inY || 0)))) return {target: "in", vertex: i}; }
                    if (v.outX || v.outY) { if (near(overlay.toScreen(v.x + v.outX, v.y + (v.outY || 0)))) return {target: "out", vertex: i}; }
                }
            }
            for (let i = 0; i < m.vertices.length; ++i) {
                if (near(overlay.toScreen(m.vertices[i].x, m.vertices[i].y))) return {target: "vertex", vertex: i};
            }
            const p = overlay.toClip(x, y);
            if (m.vertices.length >= 3) {
                const aspect = Math.hypot(overlay.uAxis.x, overlay.uAxis.y) / Math.max(1, Math.hypot(overlay.vAxis.x, overlay.vAxis.y));
                const segment = MaskEdits.nearestSegment(m, p.x, p.y, aspect);
                if (segment.distance * Math.hypot(overlay.vAxis.x, overlay.vAxis.y) <= hitRadius) return {target: "segment", vertex: segment.after, point: p};
                if (MaskEdits.contains(m, p.x, p.y)) return {target: "body"};
            }
            return {target: "none", point: p};
        }
        onPressed: mouse => {
            forceActiveFocus();
            const p = overlay.toClip(mouse.x, mouse.y);
            if (overlay.pen) {
                const open = overlay.mask && overlay.mask.vertices.length >= 1 && ClipEffectsUi.maskPen;
                if (open && overlay.mask.vertices.length >= 3) {
                    const first = overlay.toScreen(overlay.mask.vertices[0].x, overlay.mask.vertices[0].y);
                    if (Math.hypot(first.x - mouse.x, first.y - mouse.y) <= hitRadius) { overlay.closePen(); return; }
                }
                if (overlay.mask) {
                    overlay.write(MaskEdits.appendVertex(overlay.masks, overlay.mask.id, p.x, p.y), "apply");
                } else {
                    const id = ClipEffectsUi.newId();
                    overlay.write(MaskEdits.add(overlay.masks, "bezier", id, [{x: p.x, y: p.y}]), "apply");
                    ClipEffectsUi.selectMask(overlay.clipId, overlay.effectId, id, true);
                }
                target = "";
                return;
            }
            const found = hit(mouse.x, mouse.y);
            target = found.target;
            vertex = found.vertex ?? -1;
            last = Qt.point(mouse.x, mouse.y);
            pressPoint = last;
            moved = false;
            if (target === "vertex" && (mouse.modifiers & Qt.AltModifier)) {
                overlay.write(MaskEdits.removeVertex(overlay.masks, overlay.mask.id, vertex), "apply");
                overlay.selectedVertices = [];
                target = "";
                return;
            }
            if (target === "segment" && (mouse.modifiers & Qt.ControlModifier)) {
                overlay.write(MaskEdits.insertVertex(overlay.masks, overlay.mask.id, vertex, found.point.x, found.point.y), "apply");
                overlay.selectedVertices = [vertex + 1];
                target = "";
                return;
            }
            if (target === "vertex") {
                if (mouse.modifiers & Qt.ShiftModifier) {
                    const at = overlay.selectedVertices.indexOf(vertex);
                    overlay.selectedVertices = at >= 0 ? overlay.selectedVertices.filter(i => i !== vertex) : overlay.selectedVertices.concat([vertex]);
                } else if (overlay.selectedVertices.indexOf(vertex) < 0) {
                    overlay.selectedVertices = [vertex];
                }
            }
            if (target === "none" || target === "segment") {
                // A marquee from empty space selects the vertices inside it.
                target = "marquee";
                marqueeBox.x = mouse.x; marqueeBox.y = mouse.y; marqueeBox.width = 0; marqueeBox.height = 0;
                marqueeBox.visible = true;
                return;
            }
            if (target !== "") edits.begin();
        }
        onPositionChanged: mouse => {
            if (!pressed || target === "") return;
            if (target === "marquee") {
                marqueeBox.x = Math.min(pressPoint.x, mouse.x); marqueeBox.y = Math.min(pressPoint.y, mouse.y);
                marqueeBox.width = Math.abs(mouse.x - pressPoint.x); marqueeBox.height = Math.abs(mouse.y - pressPoint.y);
                return;
            }
            const total = overlay.clipDelta(mouse.x - pressPoint.x, mouse.y - pressPoint.y);
            moved = true;
            last = Qt.point(mouse.x, mouse.y);
            overlay.pendingDelta = total;
            overlay.write(overlay.dragged(target, vertex, total, mouse.modifiers & Qt.AltModifier), "preview");
        }
        onReleased: mouse => {
            if (target === "marquee") {
                marqueeBox.visible = false;
                const box = Qt.rect(marqueeBox.x, marqueeBox.y, marqueeBox.width, marqueeBox.height);
                const inside = [];
                (overlay.mask ? overlay.mask.vertices : []).forEach((v, i) => {
                    const s = overlay.toScreen(v.x, v.y);
                    if (s.x >= box.x && s.x <= box.x + box.width && s.y >= box.y && s.y <= box.y + box.height) inside.push(i);
                });
                overlay.selectedVertices = inside;
            } else if (target !== "") {
                if (moved) overlay.write(overlay.dragged(target, vertex, overlay.pendingDelta, mouse.modifiers & Qt.AltModifier), "commit");
                else edits.cancel();
            }
            target = "";
        }
        onCanceled: { if (target !== "" && target !== "marquee") edits.cancel(); marqueeBox.visible = false; target = "" }
        onDoubleClicked: mouse => {
            const found = hit(mouse.x, mouse.y);
            if (found.target === "vertex" && !overlay.pen) overlay.write(MaskEdits.toggleSmooth(overlay.masks, overlay.mask.id, found.vertex), "apply");
        }
        Keys.onReturnPressed: overlay.closePen()
        Keys.onEnterPressed: overlay.closePen()
        Keys.onEscapePressed: overlay.pen ? overlay.closePen() : ClipEffectsUi.clearMaskSelection()
        Keys.onDeletePressed: {
            if (!overlay.mask || overlay.selectedVertices.length !== 1) return;
            overlay.write(MaskEdits.removeVertex(overlay.masks, overlay.mask.id, overlay.selectedVertices[0]), "apply");
            overlay.selectedVertices = [];
        }
    }
    property point pendingDelta
    // The masks after a drag of `target` by the total clip delta since the press, from the
    // document as it was at the press: previews replace each other, so this never accumulates.
    function dragged(target, vertex, total, breakHandles) {
        const base = startMasks;
        const id = mask.id;
        if (target === "body") return MaskEdits.translate(base, id, total.x, total.y);
        if (target === "vertex") return MaskEdits.moveVertex(base, id, selectedVertices.length > 0 ? selectedVertices : [vertex], total.x, total.y, "point");
        if (target === "in" || target === "out") return MaskEdits.moveVertex(base, id, [vertex], total.x, total.y, target, breakHandles);
        const startMask = MaskEdits.find(base, id);
        if (target === "feather") {
            const dy = -total.y * Math.hypot(vAxis.x, vAxis.y) / Math.max(1, clipShorter);
            return MaskEdits.patch(base, id, {feather: Math.max(0, Math.min(0.5, (startMask.feather || 0) + dy))});
        }
        if (target === "expansion") {
            const dx = total.x * Math.hypot(uAxis.x, uAxis.y) / Math.max(1, clipShorter);
            return MaskEdits.patch(base, id, {expansion: Math.max(-0.25, Math.min(0.25, (startMask.expansion || 0) + dx))});
        }
        return base;
    }
    // The masks at the press, which a drag's previews are measured from.
    property var startMasks: []
    Connections {
        target: pointer
        function onPressedChanged() { if (pointer.pressed) overlay.startMasks = overlay.masks }
    }
    function closePen() {
        if (!pen) return;
        ClipEffectsUi.selectMask(clipId, effectId, mask && mask.vertices.length >= 3 ? mask.id : "", false);
        if (mask && mask.vertices.length < 3) write(MaskEdits.remove(masks, mask.id), "apply");
    }
    // Vertex and tangent handles.
    Repeater {
        model: overlay.active && overlay.mask ? overlay.mask.vertices : []
        delegate: Item {
            id: handle
            required property var modelData
            required property int index
            readonly property point at: overlay.toScreen(modelData.x, modelData.y)
            readonly property bool selected: overlay.selectedVertices.indexOf(index) >= 0
            readonly property bool showTangents: overlay.selectedVertices.length === 0 || selected
            Repeater {
                model: ["in", "out"]
                delegate: Item {
                    id: tangent
                    required property string modelData
                    readonly property real tx: handle.modelData[modelData + "X"] || 0
                    readonly property real ty: handle.modelData[modelData + "Y"] || 0
                    readonly property point tip: overlay.toScreen(handle.modelData.x + tx, handle.modelData.y + ty)
                    visible: handle.showTangents && (tx !== 0 || ty !== 0)
                    Shape {
                        ShapePath {
                            strokeColor: Ui.Theme.textSecondary
                            strokeWidth: Ui.Metrics.border
                            PathPolyline { path: [handle.at, tangent.tip] }
                        }
                    }
                    Rectangle {
                        objectName: "effectMaskTangent_" + tangent.modelData + "_" + handle.index
                        x: tangent.tip.x - width / 2
                        y: tangent.tip.y - height / 2
                        width: Ui.Metrics.sm
                        height: width
                        radius: Ui.Metrics.radiusPill
                        color: Ui.Theme.surfacePanel
                        border.color: Ui.Theme.statusWarning
                        border.width: Ui.Metrics.border
                    }
                }
            }
            Rectangle {
                objectName: "effectMaskVertex_" + handle.index
                x: handle.at.x - width / 2
                y: handle.at.y - height / 2
                width: Ui.Metrics.sm
                height: width
                color: handle.selected ? Ui.Theme.statusWarning : Ui.Theme.surfacePanel
                border.color: Ui.Theme.statusWarning
                border.width: Ui.Metrics.border
            }
        }
    }
    Rectangle {
        objectName: "effectMaskFeatherHandle"
        visible: overlay.active && !!overlay.maskBounds && !overlay.pen
        x: overlay.featherHandle.x - width / 2
        y: overlay.featherHandle.y - height / 2
        width: Ui.Metrics.sm
        height: width
        rotation: 45
        color: Ui.Theme.surfacePanel
        border.color: Ui.Theme.statusWarning
        border.width: Ui.Metrics.border
        Accessible.name: "Mask feather"
    }
    Rectangle {
        objectName: "effectMaskExpansionHandle"
        visible: overlay.active && !!overlay.maskBounds && !overlay.pen
        x: overlay.expansionHandle.x - width / 2
        y: overlay.expansionHandle.y - height / 2
        width: Ui.Metrics.sm
        height: width
        radius: Ui.Metrics.radiusPill
        color: Ui.Theme.statusWarning
        Accessible.name: "Mask expansion"
    }
}

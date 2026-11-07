// nt-panel: slot=right id=effectControls order=5 title="Effect Controls"
// The owner of a selected clip's Motion, Opacity, Time Remapping, Crop, Corners, Motion blur, Volume
// and effect parameters. Keyed rows read and write through ClipInspectorController and the
// keyframes.* edits. A control with no keyframes is a row in the same list, over an empty lane.
// Selection, zoom and the divider live here and never reach the document.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../../src/edit/clipeffects" as ClipFx
import "EffectControlsModel.js" as Model
Rectangle {
    id: root
    objectName: "effectControlsPanel"
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: Ui.Metrics.dialogCompactWidth
    color: Ui.Theme.surfaceCanvas
    clip: true
    focus: true
    activeFocusOnTab: true

    property var editor: null
    property var gestures: null
    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined) return item
            item = item.parent
        }
        return null
    }
    function findGestures(item) {
        if (!item) return null
        if (item.gestures !== undefined) return item.gestures
        const children = item.children || []
        for (let i = 0; i < children.length; ++i) {
            const found = findGestures(children[i])
            if (found) return found
        }
        return null
    }
    function attach() {
        editor = editorAbove()
        gestures = findGestures(editor)
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)
    function revealPanel(id) {
        if (editor && editor.focusPanel) editor.focusPanel(id)
    }

    readonly property var selectionIds: gestures ? gestures.selection : []
    readonly property alias controller: inspector
    ClipInspectorController {
        id: inspector
        objectName: "effectControlsController"
        timeline: root.editor ? root.editor.timeline : null
        // A hidden panel takes no playhead ticks.
        clock: root.editor && root.visible ? root.editor.clock : null
        clipId: root.selectionIds.length === 1 ? root.selectionIds[0] : ""
        onRowEdited: row => root.setActiveRow(row)
    }
    readonly property alias effectEdits: effectEdits
    ClipFx.ClipEffectsEdits {
        id: effectEdits
        timelineModel: inspector.timeline
        controller: inspector
    }
    readonly property var clipData: { const revision = inspector.revision; return inspector.clip }
    readonly property bool hasClip: !!clipData.id
    readonly property real clipStartMs: clipData.startMs || 0
    readonly property real durationMs: Math.max(1, clipData.durationMs || 0)
    readonly property real fps: inspector.timeline ? inspector.timeline.fps : 30
    readonly property bool locked: inspector.locked

    // The group list changes only with these ids, which keeps the rows and any drag alive
    // while a value previews.
    readonly property string groupIdentity: {
        const visual = effectEdits.orderedEffects().map(effect => effect.id)
        const sound = (clipData.audioEffects || []).map(effect => effect.id)
        return JSON.stringify([clipData.id || "", clipData.mediaType || "", visual, sound])
    }
    readonly property var ownSections: InspectorSectionRegistry.sections.filter(section => section.panel === "effectControls")
    property var groups: []
    onGroupIdentityChanged: syncGroups()
    function syncGroups() {
        groups = !hasClip ? [] : Model.groups(clipData, inspector.rows, effectEdits.orderedEffects(), clipData.audioEffects || [], ownSections)
        if (gestures && Model.rowIds(groups).indexOf(gestures.keyframeRow) < 0) {
            const ids = Model.rowIds(groups)
            if (ids.length) gestures.keyframeRow = ids[0]
        }
    }
    onHasClipChanged: syncGroups()
    onGesturesChanged: syncGroups()
    property string observedClipId: ""
    readonly property string currentClipId: clipData.id || ""
    onCurrentClipIdChanged: {
        if (currentClipId === observedClipId) return
        observedClipId = currentClipId
        clearSelection()
        endGestures()
        zoomFit()
    }

    // The active row: the one Alt+K and the keyframe navigation keys act on while this panel is open.
    readonly property string activeRow: gestures ? gestures.keyframeRow : ""
    function setActiveRow(row) { if (gestures) gestures.keyframeRow = row }
    Binding {
        when: !!root.gestures
        target: root.gestures
        property: "keyframeRowOnly"
        value: root.visible && root.hasClip && Model.rowIds(root.groups).length > 0
    }

    // The view of the lanes.
    readonly property real dividerWidth: Ui.Metrics.sm
    readonly property real minListWidth: Ui.Metrics.dialogCompactWidth * 0.38
    readonly property real minLaneWidth: Ui.Metrics.dialogCompactWidth / 3
    // Narrower than this, a row puts its values on a line of their own.
    readonly property real wideListWidth: Ui.Metrics.dialogCompactWidth * 0.72
    readonly property bool stackedRows: listWidth < wideListWidth
    property real requestedListWidth: 0
    readonly property real listWidth: Math.max(minListWidth, Math.min(requestedListWidth > 0 ? requestedListWidth : Math.max(wideListWidth, width * 0.5), width - minLaneWidth - dividerWidth))
    readonly property real laneX: listWidth + dividerWidth
    readonly property real laneWidth: Math.max(1, width - laneX)
    readonly property real minVisibleMs: Math.min(durationMs, 4000 / Math.max(1, fps))
    // Fitted, the lanes follow the clip's length. Zoomed, they keep their own view of it.
    property bool fitted: true
    property real zoomedMs: 1000
    property real requestedScrollMs: 0
    readonly property real visibleMs: fitted ? durationMs : Math.max(minVisibleMs, Math.min(durationMs, zoomedMs))
    readonly property real scrollMs: Math.max(0, Math.min(durationMs - visibleMs, requestedScrollMs))
    // A key on the clip's first or last frame draws whole, inside the lane.
    readonly property real laneInset: Ui.Metrics.md
    readonly property real pxPerMs: Math.max(1, laneWidth - 2 * laneInset) / Math.max(1, visibleMs)
    function xOf(ms) { return laneInset + (ms - scrollMs) * pxPerMs }
    function msAtX(x) { return scrollMs + (x - laneInset) / pxPerMs }
    function setView(visible, scroll) {
        fitted = visible >= durationMs
        zoomedMs = visible
        requestedScrollMs = scroll
    }
    function zoomAt(factor, anchorX) {
        const anchor = msAtX(anchorX)
        const next = Math.max(minVisibleMs, Math.min(durationMs, visibleMs / factor))
        setView(next, anchor - (anchorX - laneInset) * next / Math.max(1, laneWidth - 2 * laneInset))
    }
    function zoomFit() { setView(durationMs, 0) }
    function snapped(ms) { return Model.snappedMs(ms, clipStartMs, durationMs, fps) }
    function seekClipTime(ms) { inspector.seek(snapped(ms)) }

    // Keyframe selection: {key: {row, ms}}.
    property var selectedKeys: ({})
    readonly property int selectedCount: Object.keys(selectedKeys).length
    function isSelected(row, ms) { return selectedKeys[Model.keyOf(row, ms)] !== undefined }
    function clearSelection() { if (selectedCount) selectedKeys = ({}) }
    function selectOnly(row, ms) {
        const next = {}
        next[Model.keyOf(row, ms)] = {row: row, ms: ms}
        selectedKeys = next
    }
    function toggleSelected(row, ms) {
        const next = Object.assign({}, selectedKeys)
        const key = Model.keyOf(row, ms)
        if (next[key]) delete next[key]
        else next[key] = {row: row, ms: ms}
        selectedKeys = next
    }
    // What is still in the document, since undo can take a selected key away.
    function liveSelection() {
        const result = []
        for (const key of Object.keys(selectedKeys)) {
            const item = selectedKeys[key]
            if (inspector.rowDocument(item.row).times.indexOf(item.ms) >= 0) result.push({row: item.row, atMs: item.ms})
        }
        return result
    }
    function deleteSelection() {
        const keys = liveSelection()
        clearSelection()
        if (keys.length) inspector.write({action: "deleteMany", keys: keys})
    }
    function easeSelection(easing) {
        const keys = liveSelection()
        if (keys.length) inspector.write({action: "easingMany", keys: keys, easing: easing})
    }

    // A diamond drag. Nothing reaches the document until release, which is one undo step.
    property bool retiming: false
    property real retimeDeltaMs: 0
    property real retimeAnchorMs: 0
    property real retimeLowMs: 0
    property real retimeHighMs: 0
    function beginRetime(anchorMs) {
        const keys = liveSelection()
        if (!keys.length) return
        retimeLowMs = -Math.min(...keys.map(key => key.atMs))
        retimeHighMs = durationMs - Math.max(...keys.map(key => key.atMs))
        retimeAnchorMs = anchorMs
        retimeDeltaMs = 0
        retiming = true
    }
    function updateRetime(x) {
        if (!retiming) return
        const target = snapped(msAtX(x))
        retimeDeltaMs = Math.max(retimeLowMs, Math.min(retimeHighMs, target - retimeAnchorMs))
    }
    function commitRetime() {
        if (!retiming) return
        retiming = false
        const delta = retimeDeltaMs
        retimeDeltaMs = 0
        if (Math.abs(delta) <= 0.5) return
        const keys = liveSelection()
        if (!keys.length || !inspector.write({action: "moveMany", keys: keys, deltaMs: delta})) return
        // Times read back rounded to the millisecond, as nt::keyframes::times gives them.
        const next = {}
        for (const key of keys) {
            const ms = Math.floor(key.atMs + delta + 0.5)
            next[Model.keyOf(key.row, ms)] = {row: key.row, ms: ms}
        }
        selectedKeys = next
    }
    function endGestures() {
        retiming = false
        retimeDeltaMs = 0
        handleDragging = false
        inspector.cancelGesture()
    }
    // An influence handle has the gesture open on the controller, and the graphs hold their range.
    property bool handleDragging: false

    readonly property var rowItems: ({})
    function registerRow(id, item) { rowItems[id] = item }
    function unregisterRow(id, item) { if (rowItems[id] === item) delete rowItems[id] }
    readonly property var menu: easingMenu

    Keys.onPressed: event => {
        if (retiming || handleDragging) {
            if (event.key === Qt.Key_Escape) {
                endGestures()
                event.accepted = true
            }
            return
        }
        if (selectedCount && (event.key === Qt.Key_Delete || event.key === Qt.Key_Backspace) && !locked) {
            deleteSelection()
            event.accepted = true
        } else if (selectedCount && event.key === Qt.Key_Escape) {
            clearSelection()
            event.accepted = true
        }
    }

    Ui.EmptyState {
        objectName: "effectControlsEmpty"
        anchors.centerIn: parent
        visible: !root.hasClip
        maxTextWidth: Math.min(root.width - Ui.Metrics.xxl, Ui.Metrics.dialogCompactWidth)
        title: root.selectionIds.length > 1 ? "Several clips selected" : "No clip selected"
        message: root.selectionIds.length > 1 ? "Select one clip to see its keyframes."
            : "Select a clip on the timeline to edit its motion, opacity, crop and effects."
    }

    Item {
        anchors.fill: parent
        visible: root.hasClip

        Ui.Text {
            objectName: "effectControlsClipName"
            x: Ui.Metrics.md
            width: root.listWidth - Ui.Metrics.lg
            height: ruler.height
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
            role: Ui.Typography.SansLabel
            text: root.clipData.name || ""
        }
        EffectControlsRuler {
            id: ruler
            objectName: "effectControlsRuler"
            x: root.laneX
            width: root.laneWidth
            height: TimelineMetrics.rulerHeight
            panel: root
        }
        Ui.Separator { y: ruler.height; width: parent.width }
        Flickable {
            id: rowsView
            objectName: "effectControlsRows"
            y: ruler.height + Ui.Metrics.border
            width: parent.width
            height: footer.y - y
            contentWidth: width
            contentHeight: Math.max(height, rowsColumn.height)
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            // The wheel scrolls. A press belongs to the diamonds and the marquee.
            acceptedButtons: Qt.NoButton
            ScrollBar.vertical: Ui.ScrollBar { objectName: "effectControlsRowsScroll" }
            WheelHandler {
                objectName: "effectControlsZoomWheel"
                acceptedModifiers: Qt.ControlModifier
                onWheel: event => {
                    root.zoomAt(Math.pow(1.2, event.angleDelta.y / 120), Math.max(0, event.x - root.laneX))
                    event.accepted = true
                }
            }
            WheelHandler {
                objectName: "effectControlsScrollWheel"
                acceptedModifiers: Qt.ShiftModifier
                orientation: Qt.Vertical
                onWheel: event => {
                    root.setView(root.visibleMs, root.scrollMs - event.angleDelta.y / root.pxPerMs / 2)
                    event.accepted = true
                }
            }
            MouseArea {
                id: marquee
                objectName: "effectControlsMarqueeArea"
                x: root.laneX
                width: root.laneWidth
                height: rowsView.contentHeight
                enabled: !root.locked
                preventStealing: true
                property point origin: Qt.point(0, 0)
                property point end: Qt.point(0, 0)
                property bool active: false
                property var base: ({})
                onPressed: mouse => {
                    root.forceActiveFocus()
                    origin = Qt.point(mouse.x, mouse.y)
                    end = origin
                    base = mouse.modifiers & (Qt.ControlModifier | Qt.ShiftModifier) ? root.selectedKeys : ({})
                    active = false
                }
                onPositionChanged: mouse => {
                    if (!pressed) return
                    end = Qt.point(mouse.x, mouse.y)
                    active = active || Math.abs(end.x - origin.x) > 3 || Math.abs(end.y - origin.y) > 3
                    if (!active) return
                    const next = Object.assign({}, base)
                    const lowMs = root.msAtX(Math.min(origin.x, end.x))
                    const highMs = root.msAtX(Math.max(origin.x, end.x))
                    const top = Math.min(origin.y, end.y)
                    const bottom = Math.max(origin.y, end.y)
                    for (const id of Object.keys(root.rowItems)) {
                        const item = root.rowItems[id]
                        if (!item.visible) continue
                        const center = item.mapToItem(marquee, 0, item.laneCenterY).y
                        if (center < top || center > bottom) continue
                        for (const ms of item.doc.times) {
                            if (ms >= lowMs && ms <= highMs) next[Model.keyOf(id, ms)] = {row: id, ms: ms}
                        }
                    }
                    root.selectedKeys = next
                }
                onReleased: {
                    if (!active) root.selectedKeys = base
                    active = false
                }
                onCanceled: active = false
                Rectangle {
                    objectName: "effectControlsMarquee"
                    visible: marquee.active
                    x: Math.min(marquee.origin.x, marquee.end.x)
                    y: Math.min(marquee.origin.y, marquee.end.y)
                    width: Math.abs(marquee.end.x - marquee.origin.x)
                    height: Math.abs(marquee.end.y - marquee.origin.y)
                    color: Ui.Theme.actionSelected
                    border.width: Ui.Metrics.border
                    border.color: Ui.Theme.borderFocus
                }
            }
            Column {
                id: rowsColumn
                width: rowsView.width
                Repeater {
                    model: root.groups
                    delegate: EffectControlsGroup {
                        required property var modelData
                        width: rowsColumn.width
                        panel: root
                        group: modelData
                    }
                }
                Item {
                    width: rowsColumn.width
                    height: addEffect.height + 2 * Ui.Metrics.sm
                    Ui.EditorButton {
                        id: addEffect
                        objectName: "effectControlsAddEffect"
                        x: Ui.Metrics.md
                        y: Ui.Metrics.sm
                        text: "Add an effect"
                        iconName: "add"
                        density: Ui.EditorButton.Compact
                        variant: Ui.EditorButton.Flat
                        accessibleName: "Add an effect from the Effects panel"
                        description: accessibleName
                        onClicked: root.revealPanel("effects")
                    }
                }
            }
        }
        // One line for the playhead, so a seek moves one item and no lane or delegate.
        Rectangle {
            objectName: "effectControlsPlayheadLine"
            visible: inspector.playheadMs >= 0 && x >= root.laneX && x <= root.width
            x: root.laneX + root.xOf(inspector.playheadMs)
            y: ruler.height
            width: Ui.Metrics.border
            height: footer.y - y
            color: TimelineVisuals.overlay
            z: TimelineMetrics.clipOverlayLayer
        }
        MouseArea {
            id: divider
            objectName: "effectControlsDivider"
            x: root.listWidth
            width: root.dividerWidth
            height: footer.y
            cursorShape: Qt.SizeHorCursor
            preventStealing: true
            hoverEnabled: true
            z: TimelineMetrics.clipOverlayLayer
            onPositionChanged: mouse => {
                if (pressed) root.requestedListWidth = Math.max(root.minListWidth, Math.min(root.width - root.minLaneWidth - root.dividerWidth, root.listWidth + mouse.x))
            }
            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                width: Ui.Metrics.border
                height: parent.height
                color: divider.containsMouse || divider.pressed ? Ui.Theme.borderFocus : Ui.Theme.borderSubtle
            }
        }
        Item {
            id: footer
            objectName: "effectControlsFooter"
            y: parent.height - height
            width: parent.width
            height: Ui.Metrics.compact
            Ui.Separator { width: parent.width }
            Ui.Text {
                objectName: "effectControlsTimecode"
                x: Ui.Metrics.md
                height: parent.height
                verticalAlignment: Text.AlignVCenter
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
                text: TimelineFormat.playheadTimecode(inspector.clock ? inspector.clock.time : 0, root.fps)
            }
            Row {
                x: root.laneX - width - Ui.Metrics.xs
                height: parent.height
                Ui.ToolbarIconButton {
                    objectName: "effectControlsZoomOut"
                    anchors.verticalCenter: parent.verticalCenter
                    iconName: "remove"
                    accessibleName: "Zoom out the keyframes"
                    description: accessibleName
                    enabled: root.visibleMs < root.durationMs
                    onClicked: root.zoomAt(1 / 1.5, root.laneWidth / 2)
                }
                Ui.ToolbarIconButton {
                    objectName: "effectControlsZoomIn"
                    anchors.verticalCenter: parent.verticalCenter
                    iconName: "add"
                    accessibleName: "Zoom in the keyframes"
                    description: accessibleName
                    enabled: root.visibleMs > root.minVisibleMs
                    onClicked: root.zoomAt(1.5, root.laneWidth / 2)
                }
                Ui.ToolbarIconButton {
                    objectName: "effectControlsZoomFit"
                    anchors.verticalCenter: parent.verticalCenter
                    iconName: "fitScreen"
                    accessibleName: "Fit the clip in the keyframe lanes"
                    description: accessibleName
                    onClicked: root.zoomFit()
                }
            }
            Ui.ScrollBar {
                id: laneScroll
                objectName: "effectControlsLaneScroll"
                x: root.laneX
                width: root.laneWidth
                anchors.verticalCenter: parent.verticalCenter
                orientation: Qt.Horizontal
                size: root.visibleMs / root.durationMs
                Binding { target: laneScroll; property: "position"; value: root.scrollMs / root.durationMs; when: !laneScroll.pressed }
                onPositionChanged: if (pressed) root.setView(root.visibleMs, position * root.durationMs)
            }
        }
    }
    Ui.ContextMenu {
        id: easingMenu
        objectName: "effectControlsEasingMenu"
        property string checkedEasing: ""
        Repeater {
            model: [{value: "linear", label: "Linear"}, {value: "easeIn", label: "Ease in"}, {value: "easeOut", label: "Ease out"},
                    {value: "easeInOut", label: "Ease in/out"}, {value: "hold", label: "Hold"}]
            Ui.MenuItem {
                required property var modelData
                objectName: "effectControlsEasing_" + modelData.value
                text: modelData.label
                checkable: true
                checked: easingMenu.checkedEasing === modelData.value
                onTriggered: root.easeSelection(modelData.value)
            }
        }
        Ui.MenuItem {
            objectName: "effectControlsDeleteKeys"
            text: root.selectedCount > 1 ? "Delete keyframes" : "Delete keyframe"
            iconName: "deleteOutline"
            iconTone: Ui.Text.Error
            textTone: Ui.Text.Error
            onTriggered: root.deleteSelection()
        }
    }
}

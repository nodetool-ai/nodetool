// nt-panel: slot=bottom id=stepEditor order=106 title="Step Editor"
// UI thread only. Preview stays local, and release writes one MIDI edit.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "StepEditorModel.js" as Steps
import "PianoRollNotes.js" as Notes
import "PianoRollLanes.js" as Lanes
import "PianoRollTools.js" as Tools

Rectangle {
    id: root
    objectName: "stepEditorPanel"
    color: Ui.Theme.surfaceCanvas
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: parent && parent.parent ? parent.parent.height : Ui.Metrics.dialogCompactWidth
    property bool ready: false
    property var editor: null
    property var region: null
    property alias clipId: controller.clipId
    readonly property alias midi: controller
    readonly property var clock: editor ? editor.clock : null
    readonly property var gestures: region ? region.gestures : null
    property string laneSet: "automatic"
    property string tool: "pointer"
    property string altTool: "pencil"
    property bool inspectorVisible: true
    property bool catchOn: true
    property bool linkOn: true
    onVisibleChanged: {
        if (!visible) {
            cancelGesture();
        }
    }
    Connections {
        target: Ui.Theme
        function onDarkChanged() {
            root.repaintRequested();
        }
        function onTextScaleChanged() {
            root.repaintRequested();
        }
        function onUiScaleChanged() {
            root.repaintRequested();
        }
    }
    property real pxPerTick: 0.1
    property real rowZoom: 1
    property real scrollTick: 0
    readonly property real rowHeight: Ui.Metrics.standard * rowZoom
    readonly property real nameWidth: Ui.Metrics.xxxl * 5
    readonly property real rulerHeight: Ui.Metrics.compact
    readonly property real phase: controller.valid ? Math.round(controller.timelineMsToTick(controller.offsetMs)) : 0
    property var laneList: []
    property string selectedLaneKey: ""
    property var selectedIds: []
    property var settings: ({})
    property var addedPitches: []
    property var hiddenPitches: ({})
    property var pendingLanes: []
    property var liveNotes: null
    property var liveControllers: null
    property bool writing: false
    readonly property bool gestureActive: events.gesture !== null
    property string notice: ""
    property var pointerTick: null
    property var pointerLane: null
    readonly property var notes: liveNotes !== null ? liveNotes : controller.notes
    readonly property var controllers: liveControllers !== null ? liveControllers : controller.controllers
    readonly property var selectedLane: laneList.find(lane => keyOf(lane) === selectedLaneKey) || null
    readonly property var undoStack: controller.timeline ? controller.timeline.undoStack : null
    signal repaintRequested

    readonly property string positionText: {
        if (!controller.valid) {
            return "";
        }
        let lane = selectedLane;
        let tick = null;
        if (events.gesture && events.gesture.hit) {
            lane = events.gesture.lane;
            tick = tickOf(lane, events.gesture.hit);
        } else if (pointerTick !== null) {
            lane = pointerLane;
            tick = pointerTick;
        } else {
            const selected = new Set(selectedIds);
            for (const candidate of Steps.automaticLanes(notes, controllers)) {
                for (const event of eventsOf(candidate)) {
                    if (selected.has(event.id) && (tick === null || tickOf(candidate, event) < tick)) {
                        lane = candidate;
                        tick = tickOf(candidate, event);
                    }
                }
            }
        }
        return Tools.positionText(lane && lane.type === "note" ? lane.pitch : null, tick === null ? null : Math.round(tick), phase, controller.gridStepTicks("beat"), controller.beatsPerBar);
    }
    function keyOf(lane) {
        return !lane ? "" : lane.type === "note" ? "note:" + lane.pitch : "controller:" + lane.laneId;
    }
    function laneData(lane) {
        return lane && lane.type === "controller" ? controller.controllers.concat(pendingLanes).find(entry => entry.id === lane.laneId) : null;
    }
    function laneName(lane) {
        if (!lane) {
            return "";
        }
        if (lane.type === "note") {
            const drum = laneSet === "gmDrums" ? Steps.GM_DRUM_LANES.find(entry => entry.pitch === lane.pitch) : null;
            return drum ? drum.name : Notes.pitchName(lane.pitch);
        }
        const data = laneData(lane);
        if (!data) {
            return "";
        }
        if (data.kind === "pitchBend") {
            return qsTr("Pitch Bend");
        }
        if (data.kind === "channelPressure") {
            return qsTr("Channel Pressure");
        }
        if (data.kind === "polyPressure") {
            return qsTr("Poly Pressure %1").arg(Notes.pitchName(data.pitch));
        }
        const names = {
            1: qsTr("Modulation"),
            7: qsTr("Volume"),
            10: qsTr("Pan"),
            11: qsTr("Expression"),
            64: qsTr("Sustain")
        };
        return names[data.cc] || qsTr("CC %1").arg(data.cc);
    }
    function laneRange(lane) {
        return lane.type === "note" ? {
            min: 1,
            max: 127
        } : Lanes.rangeOf(laneData(lane) ? laneData(lane).kind : "cc");
    }
    function laneSettings(lane) {
        const saved = lane ? settings[keyOf(lane)] || {} : {};
        const grid = saved.grid || "1/16";
        return {
            grid: grid,
            penWidth: saved.penWidth === undefined ? 5 : saved.penWidth,
            frames: saved.frames || false,
            length: saved.length === undefined ? Tools.divisionTicks(grid) : saved.length
        };
    }
    function setLaneSetting(name, value) {
        setLaneSettingFor(selectedLaneKey, name, value);
    }
    function setLaneSettingFor(key, name, value) {
        if (!selectedLane || events.gesture) {
            return;
        }
        const next = Object.assign({}, settings);
        next[key] = Object.assign({}, next[key] || {});
        next[key][name] = value;
        settings = next;
        repaintRequested();
    }
    function rebuildLanes() {
        if (!ready) {
            return;
        }
        const currentNotes = controller.notes;
        const hidden = Object.assign({}, hiddenPitches);
        // A newly appearing event at a hidden pitch makes that lane visible again.
        for (const pitch of Object.keys(hidden)) {
            const seen = new Set(hidden[pitch]);
            if (currentNotes.some(note => note.pitch === Number(pitch) && !seen.has(note.id))) {
                delete hidden[pitch];
            }
        }
        hiddenPitches = hidden;
        const noteLanes = laneSet === "gmDrums" ? Steps.GM_DRUM_LANES.map(entry => ({
                    type: "note",
                    pitch: entry.pitch
                })) : Steps.automaticLanes(currentNotes, []).concat(addedPitches.filter(pitch => !currentNotes.some(note => note.pitch === pitch)).map(pitch => ({
                    type: "note",
                    pitch: pitch
                }))).filter(lane => hidden[lane.pitch] === undefined).sort((a, b) => b.pitch - a.pitch);
        const stored = controller.controllers;
        pendingLanes = pendingLanes.filter(lane => !stored.some(entry => entry.id === lane.id || Lanes.sameSpec(entry, lane)));
        const list = laneSet === "gmDrums" ? noteLanes : noteLanes.concat(stored.concat(pendingLanes).map(lane => ({
                    type: "controller",
                    laneId: lane.id
                })));
        laneList = list;
        laneRows.setLanes(list);
        if (!list.some(lane => keyOf(lane) === selectedLaneKey)) {
            selectedLaneKey = list.length ? keyOf(list[0]) : "";
        }
        pruneSelection();
        repaintRequested();
    }
    function eventsOf(lane) {
        if (!lane) {
            return [];
        }
        if (lane.type === "note") {
            return notes.filter(note => note.pitch === lane.pitch && note.startTick >= controller.windowFromTick && note.startTick < controller.windowToTick);
        }
        const current = controllers.concat(pendingLanes).find(entry => entry.id === lane.laneId);
        return current ? current.points.filter(event => event.tick >= controller.windowFromTick && event.tick < controller.windowToTick) : [];
    }
    function tickOf(lane, event) {
        return lane.type === "note" ? event.startTick : event.tick;
    }
    function valueOf(lane, event) {
        return lane.type === "note" ? event.velocity : event.value;
    }
    function pruneSelection() {
        if (!selectedIds.length) {
            return;
        }
        const ids = new Set(notes.filter(note => note.startTick >= controller.windowFromTick && note.startTick < controller.windowToTick).map(note => note.id));
        for (const lane of controllers) {
            for (const point of lane.points) {
                if (point.tick >= controller.windowFromTick && point.tick < controller.windowToTick) { ids.add(point.id); }
            }
        }
        selectedIds = selectedIds.filter(id => ids.has(id));
    }
    function selectLane(lane) {
        selectedLaneKey = keyOf(lane);
    }
    function attach() {
        let parentItem = parent;
        while (parentItem && !(parentItem.timeline !== undefined && parentItem.clock !== undefined)) {
            parentItem = parentItem.parent;
        }
        editor = parentItem;
        function findRegion(item) {
            if (!item) {
                return null;
            }
            if (item.gestures !== undefined && item.viewState !== undefined) {
                return item;
            }
            for (const child of item.children || []) {
                const found = findRegion(child);
                if (found) {
                    return found;
                }
            }
            return null;
        }
        region = findRegion(editor);
        followSelection();
    }
    function followSelection() {
        if (!linkOn || !gestures || !gestures.selection || gestures.selection.length !== 1) {
            return;
        }
        const id = gestures.selection[0], clip = gestures.clipData(id);
        if (clip && clip.mediaType === "midi") {
            clipId = id;
        }
    }
    Component.onCompleted: {
        ready = true;
        Qt.callLater(attach);
        rebuildLanes();
    }
    onParentChanged: Qt.callLater(attach)
    onLinkOnChanged: followSelection()
    onLaneSetChanged: {
        cancelGesture();
        rebuildLanes();
    }
    onSelectedIdsChanged: repaintRequested()
    onSelectedLaneKeyChanged: repaintRequested()
    onScrollTickChanged: repaintRequested()
    onPxPerTickChanged: repaintRequested()
    onRowHeightChanged: repaintRequested()
    Connections {
        target: root.gestures
        ignoreUnknownSignals: true
        function onSelectionChanged() {
            root.followSelection();
        }
    }
    Connections {
        target: root.clock
        ignoreUnknownSignals: true
        function onTimeChanged() {
            if (!root.visible || !root.catchOn || !root.clock.playing || !controller.valid || eventArea.width <= 0) {
                return;
            }
            const next = Math.max(controller.windowFromTick, Tools.catchScroll(controller.timelineMsToTick(root.clock.time), root.scrollTick, eventArea.width / root.pxPerTick));
            if (next !== root.scrollTick) { root.scrollTick = next; }
        }
    }
    PianoRollController {
        id: controller
        timeline: root.editor ? root.editor.timeline : null
        onClipIdChanged: {
            if (root.ready) { numberDialog.close(); deleteDialog.close(); }
            root.cancelGesture();
            root.selectedIds = [];
            root.settings = ({});
            root.addedPitches = [];
            root.hiddenPitches = ({});
            root.pendingLanes = [];
            root.scrollTick = 0;
        }
        onClipChanged: {
            if (!root.writing) {
                root.cancelGesture();
            }
            if (root.scrollTick < windowFromTick) {
                root.scrollTick = windowFromTick;
            }
            root.rebuildLanes();
        }
    }
    StepEditorLaneModel {
        id: laneRows
    }
    function mergeNotes(lane, list) {
        list = list.concat(controller.notes.filter(note => note.pitch === lane.pitch && (note.startTick < controller.windowFromTick || note.startTick >= controller.windowToTick)));
        const replacements = new Map(list.map(note => [note.id, note]));
        const existing = new Set(controller.notes.map(note => note.id));
        return controller.notes.filter(note => note.pitch !== lane.pitch || replacements.has(note.id)).map(note => note.pitch === lane.pitch ? replacements.get(note.id) : note).concat(list.filter(note => !existing.has(note.id)));
    }
    function writeEvents(lane, list) {
        if (!controller.editable) {
            return false;
        }
        writing = true;
        let accepted = false;
        if (lane.type === "note") {
            accepted = controller.setNotes(mergeNotes(lane, list));
        } else {
            const data = laneData(lane) || pendingLanes.find(entry => entry.id === lane.laneId);
            const points = list.concat(data.points.filter(point => point.tick < controller.windowFromTick || point.tick >= controller.windowToTick)).sort((a, b) => a.tick - b.tick);
            const next = Lanes.setLanePoints(controller.controllers, data, points, () => data.id);
            accepted = next !== null && controller.setControllers(next);
        }
        writing = false;
        if (!accepted) {
            notice = qsTr("Could not apply MIDI edit. Check the clip and event limits.");
        }
        return accepted;
    }
    function previewEvents(lane, list) {
        if (lane.type === "note") {
            liveNotes = mergeNotes(lane, list);
        } else {
            const data = laneData(lane) || pendingLanes.find(entry => entry.id === lane.laneId);
            const points = list.concat(data.points.filter(point => point.tick < controller.windowFromTick || point.tick >= controller.windowToTick)).sort((a, b) => a.tick - b.tick);
            const next = Lanes.setLanePoints(controller.controllers, data, points, () => data.id);
            if (next === null) {
                notice = qsTr("The controller lane limit has been reached.");
                return;
            }
            liveControllers = next;
        }
        repaintRequested();
    }
    function cancelGesture() {
        if (!ready) {
            return;
        }
        if (events.gesture) {
            selectedLaneKey = events.gesture.laneBefore;
            selectedIds = events.gesture.selectionBefore;
        }
        events.gesture = null;
        liveNotes = null;
        liveControllers = null;
        repaintRequested();
    }
    function newControllerLane(kind, number) {
        if (!controller.editable || events.gesture) {
            return;
        }
        laneSet = "automatic";
        const spec = {
            kind: kind,
            channel: 0
        };
        if (kind === "cc") {
            spec.cc = Math.max(0, Math.min(127, Math.round(number)));
        }
        if (kind === "polyPressure") {
            spec.pitch = Math.max(0, Math.min(127, Math.round(number)));
        }
        const existing = controller.controllers.concat(pendingLanes).find(lane => Lanes.sameSpec(lane, spec));
        if (existing) {
            selectedLaneKey = "controller:" + existing.id;
            selectedIds = [];
            return;
        }
        if (controller.controllers.length + pendingLanes.length >= Lanes.MAX_LANES) {
            notice = qsTr("The controller lane limit has been reached.");
            return;
        }
        pendingLanes = pendingLanes.concat([Object.assign({}, spec, {
                id: controller.newNoteId(),
                points: [],
                interpolation: "linear"
            })]);
        rebuildLanes();
        selectedLaneKey = "controller:" + pendingLanes[pendingLanes.length - 1].id;
        selectedIds = [];
    }
    function newNoteLane(pitch) {
        if (!controller.editable || events.gesture) {
            return;
        }
        pitch = Math.max(0, Math.min(127, Math.round(pitch)));
        if (!addedPitches.includes(pitch)) {
            addedPitches = addedPitches.concat([pitch]);
        }
        const hidden = Object.assign({}, hiddenPitches);
        delete hidden[pitch];
        hiddenPitches = hidden;
        laneSet = "automatic";
        rebuildLanes();
        selectedLaneKey = "note:" + pitch;
        selectedIds = [];
    }
    function deleteLane(confirmed) {
        if (confirmed && selectedLaneKey !== deleteDialog.laneKey) {
            return;
        }
        if (laneSet !== "automatic" || !selectedLane || events.gesture || !controller.editable) {
            return;
        }
        if (selectedLane.type === "note") {
            selectedIds = [];
            const pitch = selectedLane.pitch;
            const hidden = Object.assign({}, hiddenPitches);
            hidden[pitch] = controller.notes.filter(note => note.pitch === pitch).map(note => note.id);
            hiddenPitches = hidden;
            addedPitches = addedPitches.filter(entry => entry !== pitch);
            rebuildLanes();
        } else {
            if (laneData(selectedLane).points.length && !confirmed) {
                deleteDialog.laneKey = selectedLaneKey;
                deleteDialog.open();
                return;
            }
            selectedIds = [];
            const id = selectedLane.laneId;
            pendingLanes = pendingLanes.filter(lane => lane.id !== id);
            if (controller.controllers.some(lane => lane.id === id)) {
                controller.setControllers(controller.controllers.filter(lane => lane.id !== id));
            }
            rebuildLanes();
        }
    }
    function transformValues(mode, argument) {
        if (!selectedIds.length || events.gesture || !controller.editable) {
            return;
        }
        const selected = new Set(selectedIds);
        let removed = selected;
        if (mode === "thin") {
            removed = new Set();
            for (const lane of Steps.automaticLanes(controller.notes, controller.controllers)) {
                const ordered = eventsOf(lane).map((event, index) => ({
                            event: event,
                            index: index
                        })).filter(entry => selected.has(entry.event.id)).sort((a, b) => tickOf(lane, a.event) - tickOf(lane, b.event) || a.index - b.index).map(entry => entry.event.id);
                for (const id of Steps.thinOut(ordered)) {
                    removed.add(id);
                }
            }
        }
        function transform(list, field, range) {
            if (mode === "delete" || mode === "thin") {
                return list.filter(event => !removed.has(event.id));
            }
            return list.map(event => {
                if (!selected.has(event.id)) {
                    return event;
                }
                const value = mode === "set" ? argument : Steps.scaleValues([event[field]], argument, range.min)[0];
                const copy = Object.assign({}, event);
                copy[field] = Math.max(range.min, Math.min(range.max, Math.round(value)));
                return copy;
            });
        }
        const nextNotes = transform(controller.notes, "velocity", {
            min: 1,
            max: 127
        });
        let nextControllers = controller.controllers;
        for (const lane of controller.controllers) {
            if (!lane.points.some(point => selected.has(point.id))) {
                continue;
            }
            const points = transform(lane.points, "value", Lanes.rangeOf(lane.kind));
            nextControllers = Lanes.setLanePoints(nextControllers, lane, points, () => lane.id);
        }
        const notesChanged = JSON.stringify(nextNotes) !== JSON.stringify(controller.notes);
        const controllersChanged = JSON.stringify(nextControllers) !== JSON.stringify(controller.controllers);
        if (notesChanged || controllersChanged) {
            writing = true;
            const accepted = notesChanged && controllersChanged ? controller.setEvents(nextNotes, nextControllers) : notesChanged ? controller.setNotes(nextNotes) : controller.setControllers(nextControllers);
            writing = false;
            if (!accepted) {
                notice = qsTr("Could not apply MIDI edit. Check the clip and event limits.");
            } else if (mode === "delete" || mode === "thin") {
                selectedIds = [];
            }
        }
        pruneSelection();
    }
    function runAction(action) {
        if (events.gesture) {
            return;
        }
        switch (action) {
        case "undo":
            if (undoStack) {
                undoStack.undo();
            }
            return;
        case "redo":
            if (undoStack) {
                undoStack.redo();
            }
            return;
        case "selectAll":
            selectedIds = eventsOf(selectedLane).map(event => event.id);
            return;
        case "deselectAll":
            selectedIds = [];
            return;
        case "delete":
            transformValues("delete", 0);
            return;
        case "thin":
            transformValues("thin", 0);
            return;
        case "deleteLane":
            deleteLane(false);
            return;
        case "inspector":
            inspectorVisible = !inspectorVisible;
            return;
        case "catch":
            catchOn = !catchOn;
            return;
        case "link":
            linkOn = !linkOn;
            return;
        case "scale":
            numberDialog.ask("scale", qsTr("Scale Values (%)"), 100, 0, 200);
            return;
        case "set":
            if (selectedLane) {
                const range = laneRange(selectedLane);
                numberDialog.ask("set", qsTr("Set to Value"), range.min, range.min, range.max);
            }
            return;
        case "newNote":
            numberDialog.ask("note", qsTr("New Note Lane"), 60, 0, 127);
            return;
        case "otherCc":
            numberDialog.ask("cc", qsTr("Other CC"), 0, 0, 127);
            return;
        }
        if (action.indexOf("cc:") === 0) {
            newControllerLane("cc", Number(action.substring(3)));
        } else if (action === "pitchBend" || action === "channelPressure") {
            newControllerLane(action, 0);
        }
    }
    focus: true
    Keys.onPressed: event => {
        if (events.gesture) {
            event.accepted = true;
            return;
        }
        const command = (event.modifiers & Qt.ControlModifier) !== 0;
        if (command && event.key === Qt.Key_A) {
            runAction("selectAll");
            event.accepted = true;
        } else if (command && event.key === Qt.Key_Z) {
            runAction(event.modifiers & Qt.ShiftModifier ? "redo" : "undo");
            event.accepted = true;
        } else if (command && event.key === Qt.Key_Y) {
            runAction("redo");
            event.accepted = true;
        } else if (event.key === Qt.Key_Delete || event.key === Qt.Key_Backspace) {
            runAction("delete");
            event.accepted = true;
        } else if (event.key === Qt.Key_Escape) {
            selectedIds = [];
            event.accepted = true;
        }
    }

    StepEditorToolbar {
        id: toolbar
        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
        }
        panel: root
    }
    Ui.Banner {
        id: banner
        anchors {
            left: parent.left
            right: parent.right
            top: toolbar.bottom
        }
        visible: root.notice !== ""
        message: root.notice
        actionText: qsTr("Dismiss")
        onActionTriggered: root.notice = ""
    }
    StepEditorInspector {
        id: inspector
        panel: root
        visible: root.inspectorVisible
        x: 0
        y: toolbar.height + (banner.visible ? banner.height : 0)
        width: visible ? Math.min(Ui.Metrics.xxxl * 7, root.width / 3) : 0
        height: root.height - y
    }
    Item {
        id: body
        x: inspector.width
        y: inspector.y
        width: root.width - x
        height: root.height - y
        Rectangle {
            id: ruler
            width: parent.width
            height: root.rulerHeight
            color: Ui.Theme.surfacePanel
            // The heading lines up with the lane names under it.
            Ui.Text {
                x: Ui.Metrics.micro + Ui.Metrics.lg
                anchors.verticalCenter: parent.verticalCenter
                text: qsTr("Lane")
                role: Ui.Typography.SansLabel
            }
            Canvas {
                id: rulerCanvas
                x: root.nameWidth
                width: parent.width - x
                height: parent.height
                onWidthChanged: requestPaint()
                Connections {
                    target: root
                    function onRepaintRequested() {
                        rulerCanvas.requestPaint();
                    }
                }
                onPaint: {
                    const ctx = getContext("2d");
                    ctx.reset();
                    if (!controller.valid) {
                        return;
                    }
                    const bar = controller.gridStepTicks("bar");
                    // Bar numbers and ticks as in the piano roll ruler.
                    ctx.font = Ui.Typography.canvasFont(Ui.Typography.SansCaption);
                    for (const tick of Tools.stepLineTicks(root.scrollTick, root.scrollTick + width / root.pxPerTick, bar, root.phase)) {
                        const labelEvery = Math.max(1, Math.ceil(Ui.Metrics.touch / (bar * root.pxPerTick)));
                        if (Math.round((tick - root.phase) / bar) % labelEvery !== 0) { continue; }
                        const x = Math.round((tick - root.scrollTick) * root.pxPerTick);
                        ctx.fillStyle = Ui.Theme.borderStrong;
                        ctx.fillRect(x, height / 2, Ui.Metrics.border, height / 2);
                        ctx.fillStyle = Ui.Theme.textSecondary;
                        ctx.textBaseline = "middle";
                        ctx.fillText(String(Math.round((tick - root.phase) / bar) + 1), x + Ui.Metrics.xs, height / 2);
                    }
                }
            }
        }
        ListView {
            id: rows
            y: ruler.height
            width: parent.width
            height: parent.height - y
            model: laneRows
            clip: true
            reuseItems: true
            cacheBuffer: height
            boundsBehavior: Flickable.StopAtBounds
            delegate: StepEditorRow {
                panel: root
                width: rows.width
                height: root.rowHeight
            }
        }
        Item {
            id: eventArea
            objectName: "stepEditorEvents"
            x: root.nameWidth
            y: ruler.height
            width: Math.max(0, parent.width - x)
            height: rows.height
            clip: true
            MouseArea {
                id: events
                objectName: "stepEditorMouse"
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: (gesture ? gesture.tool : root.tool) === "pointer" ? Qt.ArrowCursor
                    : (gesture ? gesture.tool : root.tool) === "eraser" ? Qt.ForbiddenCursor : Qt.CrossCursor
                property var gesture: null
                function location(mouse, lane) {
                    const row = root.laneList.findIndex(entry => root.keyOf(entry) === root.keyOf(lane));
                    const range = root.laneRange(lane);
                    return {
                        tick: Math.max(controller.windowFromTick, Math.min(controller.windowToTick, root.scrollTick + mouse.x / root.pxPerTick)),
                        value: Steps.valueFromY(mouse.y + (rows.contentY - rows.originY) - row * root.rowHeight, root.rowHeight, range.min, range.max)
                    };
                }
                function beam(lane, event, pointerTarget) {
                    const range = root.laneRange(lane), data = root.laneData(lane);
                    const value = root.valueOf(lane, event);
                    const bottom = data && data.kind === "pitchBend" ? root.rowHeight * range.max / (range.max - range.min) : root.rowHeight;
                    const y = lane.type === "note" ? root.rowHeight * (1 - value / 127) : root.rowHeight * (range.max - value) / (range.max - range.min);
                    const height = Math.max(Ui.Metrics.border, Math.abs(bottom - y));
                    const top = data && data.kind === "pitchBend" ? Math.min(y, bottom) : root.rowHeight - height;
                    const targetHeight = pointerTarget ? Math.max(height, Ui.Metrics.sm) : height;
                    const targetWidth = pointerTarget ? Math.max(root.laneSettings(lane).penWidth, Ui.Metrics.xs) : root.laneSettings(lane).penWidth;
                    return {
                        x: (root.tickOf(lane, event) - root.scrollTick) * root.pxPerTick,
                        y: Math.max(0, Math.min(root.rowHeight - targetHeight, top - (targetHeight - height) / 2)),
                        height: targetHeight,
                        width: targetWidth
                    };
                }
                function touches(rect, x0, y0, x1, y1) {
                    let low = 0, high = 1;
                    for (const axis of [
                        {
                            start: x0,
                            delta: x1 - x0,
                            min: rect.x,
                            max: rect.x + rect.width
                        },
                        {
                            start: y0,
                            delta: y1 - y0,
                            min: rect.y,
                            max: rect.y + rect.height
                        }
                    ]) {
                        if (axis.delta === 0) {
                            if (axis.start < axis.min || axis.start > axis.max) {
                                return false;
                            }
                        } else {
                            const a = (axis.min - axis.start) / axis.delta, b = (axis.max - axis.start) / axis.delta;
                            low = Math.max(low, Math.min(a, b));
                            high = Math.min(high, Math.max(a, b));
                            if (low > high) {
                                return false;
                            }
                        }
                    }
                    return true;
                }
                function drawAt(point) {
                    const g = gesture, setting = root.laneSettings(g.lane), step = Tools.divisionTicks(setting.grid);
                    let vectors;
                    if (g.tool === "line") {
                        vectors = Steps.lineSteps(g.previous.tick, g.previous.value, point.tick, point.value, step, root.phase);
                    } else {
                        const from = Steps.stepStartTick(g.previous.tick, step, root.phase);
                        const to = Steps.stepStartTick(point.tick, step, root.phase);
                        vectors = [];
                        if (from !== to) {
                            const direction = to > from ? step : -step;
                            for (let tick = from + direction; direction > 0 ? tick < to : tick > to; tick += direction) {
                                const f = (tick - from) / (to - from);
                                vectors.push({tick: tick, value: Math.round(g.previous.value + (point.value - g.previous.value) * f)});
                            }
                        }
                        vectors.push({tick: to, value: point.value});
                    }
                    let list = g.list;
                    for (const vector of vectors) {
                        const start = Math.ceil(Math.max(controller.windowFromTick, vector.tick));
                        const span = Math.min(vector.tick + step, controller.windowToTick) - start;
                        if (span <= 0) {
                            continue;
                        }
                        const next = g.lane.type === "note" ? Steps.drawNoteStep(list, g.lane.pitch, start, span, vector.value, setting.length, () => controller.newNoteId()) : Steps.drawStep(list, start, span, vector.value, () => controller.newNoteId());
                        const storedCount = g.lane.type === "note" ? controller.notes.length : root.laneData(g.lane).points.length;
                        const total = storedCount - g.baseline.length + next.length;
                        if (total <= (g.lane.type === "note" ? controller.maxNotes : Lanes.MAX_POINTS)) {
                            list = next;
                        } else {
                            root.notice = qsTr("The MIDI event limit has been reached.");
                        }
                    }
                    g.list = list;
                    root.previewEvents(g.lane, list);
                    g.previous = point;
                }
                function eraseAt(mouse) {
                    const g = gesture;
                    const row = root.laneList.findIndex(lane => root.keyOf(lane) === root.keyOf(g.lane));
                    const y = mouse.y + (rows.contentY - rows.originY) - row * root.rowHeight;
                    g.list = g.list.filter(event => !touches(beam(g.lane, event), g.lastX, g.eraseY, mouse.x, y));
                    g.lastX = mouse.x;
                    g.eraseY = y;
                    root.previewEvents(g.lane, g.list);
                }
                onPressed: mouse => {
                    root.forceActiveFocus();
                    if (!controller.valid) {
                        return;
                    }
                    const row = Math.floor((mouse.y + rows.contentY - rows.originY) / root.rowHeight), lane = root.laneList[row];
                    if (!lane) {
                        return;
                    }
                    const before = root.selectedIds.slice();
                    const laneBefore = root.selectedLaneKey;
                    root.selectLane(lane);
                    const tool = controller.editable ? ((mouse.modifiers & Qt.ControlModifier) ? root.altTool : root.tool) : "pointer";
                    const list = root.eventsOf(lane).slice(), y = mouse.y + (rows.contentY - rows.originY) - row * root.rowHeight;
                    const hit = list.slice().reverse().find(event => touches(beam(lane, event, tool === "pointer"), mouse.x, y, mouse.x, y));
                    if (tool === "pointer" && hit) {
                        if (mouse.modifiers & Qt.ShiftModifier) {
                            root.selectedIds = root.selectedIds.includes(hit.id) ? root.selectedIds.filter(id => id !== hit.id) : root.selectedIds.concat([hit.id]);
                            return;
                        } else if (!root.selectedIds.includes(hit.id)) {
                            root.selectedIds = [hit.id];
                        }
                    } else if (tool === "pointer" && !(mouse.modifiers & Qt.ShiftModifier)) {
                        root.selectedIds = [];
                    }
                    gesture = {
                        lane: lane,
                        tool: tool,
                        baseline: list,
                        list: list,
                        selectionBefore: before,
                        laneBefore: laneBefore,
                        selection: root.selectedIds.slice(),
                        startX: mouse.x,
                        startY: mouse.y,
                        lastX: mouse.x,
                        lastY: mouse.y,
                        eraseY: y,
                        marqueeTop: mouse.y,
                        marqueeBottom: mouse.y,
                        moved: false,
                        previous: location(mouse, lane),
                        origin: location(mouse, lane),
                        hit: hit,
                        shift: !!(mouse.modifiers & Qt.ShiftModifier)
                    };
                    if (tool === "pencil") {
                        drawAt(gesture.origin);
                    }
                    if (tool === "eraser") {
                        eraseAt(mouse);
                    }
                }
                onExited: {
                    if (!gesture) {
                        root.pointerTick = null;
                        root.pointerLane = null;
                    }
                }
                onPositionChanged: mouse => {
                    root.pointerTick = root.scrollTick + mouse.x / root.pxPerTick;
                    root.pointerLane = root.laneList[Math.floor((mouse.y + rows.contentY - rows.originY) / root.rowHeight)] || null;
                    if (!gesture) {
                        return;
                    }
                    const g = gesture, point = location(mouse, g.lane);
                    if (g.tool === "pencil") {
                        drawAt(point);
                    } else if (g.tool === "line") {
                        g.previous = point;
                        preview.requestPaint();
                    } else if (g.tool === "eraser") {
                        eraseAt(mouse);
                    } else if (g.hit && controller.editable) {
                        if (!g.moved && Math.abs(mouse.y - g.startY) <= Ui.Metrics.xs) { return; }
                        g.moved = true;
                        const selected = new Set(g.selection), range = root.laneRange(g.lane);
                        const chosen = g.baseline.filter(event => selected.has(event.id));
                        if (!chosen.length) {
                            return;
                        }
                        const raw = Math.round((g.startY - mouse.y) * (range.max - range.min) / root.rowHeight);
                        const delta = Math.max(range.min - Math.min(...chosen.map(event => root.valueOf(g.lane, event))), Math.min(range.max - Math.max(...chosen.map(event => root.valueOf(g.lane, event))), raw));
                        g.list = g.baseline.map(event => {
                            const copy = Object.assign({}, event);
                            if (selected.has(event.id)) {
                                copy[g.lane.type === "note" ? "velocity" : "value"] = root.valueOf(g.lane, event) + delta;
                            }
                            return copy;
                        });
                        root.previewEvents(g.lane, g.list);
                    } else if (!g.hit) {
                        const row = root.laneList.findIndex(lane => root.keyOf(lane) === root.keyOf(g.lane));
                        const top = Math.min(g.startY, mouse.y) + (rows.contentY - rows.originY) - row * root.rowHeight, bottom = Math.max(g.startY, mouse.y) + (rows.contentY - rows.originY) - row * root.rowHeight;
                        const left = Math.min(g.startX, mouse.x), right = Math.max(g.startX, mouse.x);
                        const ids = g.baseline.filter(event => {
                            const rect = beam(g.lane, event);
                            return rect.x <= right && rect.x + rect.width >= left && rect.y <= bottom && rect.y + rect.height >= top;
                        }).map(event => event.id);
                        root.selectedIds = Array.from(new Set((g.shift ? g.selection : []).concat(ids)));
                        g.previous = point;
                        g.lastX = mouse.x;
                        g.lastY = mouse.y;
                        g.moved = mouse.x !== g.startX || mouse.y !== g.startY;
                        const rowTop = row * root.rowHeight - (rows.contentY - rows.originY);
                        g.marqueeTop = Math.max(rowTop, Math.min(g.startY, mouse.y));
                        g.marqueeBottom = Math.min(rowTop + root.rowHeight, Math.max(g.startY, mouse.y));
                        preview.requestPaint();
                    }
                }
                onReleased: mouse => {
                    if (!gesture) {
                        return;
                    }
                    const g = gesture;
                    try {
                        if (g.tool === "line") {
                            g.previous = g.origin;
                            drawAt(location(mouse, g.lane));
                        } else if (g.tool === "pencil") {
                            drawAt(location(mouse, g.lane));
                        } else if (g.tool === "eraser") {
                            eraseAt(mouse);
                        }
                        if (!containsMouse) { root.pointerTick = null; root.pointerLane = null; }
                        if (JSON.stringify(g.baseline) !== JSON.stringify(g.list)) {
                            root.writeEvents(g.lane, g.list);
                        }
                    } finally {
                        gesture = null;
                        root.liveNotes = null;
                        root.liveControllers = null;
                        root.pruneSelection();
                        root.repaintRequested();
                        preview.requestPaint();
                    }
                }
                onCanceled: root.cancelGesture()
                onWheel: wheel => {
                    if (gesture) {
                        wheel.accepted = true;
                        return;
                    }
                    if ((wheel.modifiers & Qt.ShiftModifier) || wheel.angleDelta.x !== 0) {
                        const delta = wheel.angleDelta.x || wheel.angleDelta.y;
                        root.scrollTick = Math.max(controller.windowFromTick, root.scrollTick - delta / root.pxPerTick);
                        if (root.clock && root.clock.playing) {
                            root.catchOn = false;
                        }
                    } else {
                        rows.contentY = Math.max(rows.originY, Math.min(rows.originY + Math.max(0, rows.contentHeight - rows.height), rows.contentY - wheel.angleDelta.y));
                    }
                    wheel.accepted = true;
                }
            }
            Rectangle {
                x: (controller.timelineMsToTick(root.clock ? root.clock.time : 0) - root.scrollTick) * root.pxPerTick
                width: Ui.Metrics.border
                height: parent.height
                color: Ui.Theme.accentSecondary
                visible: !!root.clock && controller.valid
            }
            Canvas {
                id: preview
                anchors.fill: parent
                Connections {
                    target: root
                    function onRepaintRequested() {
                        preview.requestPaint();
                    }
                }
                onPaint: {
                    const ctx = getContext("2d");
                    ctx.reset();
                    const g = events.gesture;
                    if (!g) {
                        return;
                    }
                    ctx.strokeStyle = Ui.Theme.textSecondary;
                    ctx.lineWidth = Ui.Metrics.border;
                    if (g.tool === "line") {
                        const index = root.laneList.findIndex(lane => root.keyOf(lane) === root.keyOf(g.lane)), range = root.laneRange(g.lane);
                        const y = value => index * root.rowHeight - (rows.contentY - rows.originY) + root.rowHeight * (range.max - value) / (range.max - range.min);
                        ctx.beginPath();
                        ctx.moveTo((g.origin.tick - root.scrollTick) * root.pxPerTick, y(g.origin.value));
                        ctx.lineTo((g.previous.tick - root.scrollTick) * root.pxPerTick, y(g.previous.value));
                        ctx.stroke();
                    } else if (g.tool === "pointer" && !g.hit && g.moved) {
                        ctx.setLineDash([Ui.Metrics.xs, Ui.Metrics.xs]);
                        ctx.strokeRect(g.startX, g.marqueeTop, g.lastX - g.startX, g.marqueeBottom - g.marqueeTop);
                    }
                }
            }
        }
    }
    Ui.EmptyState {
        anchors.centerIn: body
        visible: !controller.valid || root.laneList.length === 0
        title: controller.valid ? qsTr("No lanes") : qsTr("No MIDI clip")
        message: controller.valid ? qsTr("Add a note or controller lane from Lanes.") : qsTr("Select a MIDI clip to edit its events.")
    }
    Ui.Dialog {
        id: numberDialog
        onOpened: field.forceActiveFocus(Qt.PopupFocusReason)
        returnFocusTo: root
        property string action: ""
        property real initial: 0
        property real minimum: 0
        property real maximum: 127
        width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width : Ui.Metrics.dialogCompactWidth)
        function ask(mode, titleText, value, min, max) {
            action = mode;
            title = titleText;
            initial = value;
            minimum = min;
            maximum = max;
            field.text = String(value);
            open();
        }
        function apply() {
            if (!field.draftValid) { return; }
            const value = Number(field.text);
            if (action === "note") { root.newNoteLane(value); }
            else if (action === "cc") { root.newControllerLane("cc", value); }
            else { root.transformValues(action, value); }
            close();
        }
        Column {
            width: parent.width
            spacing: Ui.Metrics.md
            Ui.NumberField {
                id: field
                onAccepted: numberDialog.apply()
                width: parent.width
                accessibleName: numberDialog.title
                value: numberDialog.initial
                from: numberDialog.minimum
                to: numberDialog.maximum
            }
            Row {
                spacing: Ui.Metrics.sm
                Ui.EditorButton {
                    text: qsTr("Cancel")
                    onClicked: numberDialog.close()
                }
                Ui.EditorButton {
                    text: qsTr("Apply")
                    enabled: field.draftValid
                    onClicked: numberDialog.apply()
                }
            }
        }
    }
    Ui.Dialog {
        id: deleteDialog
        returnFocusTo: root
        property string laneKey: ""
        title: qsTr("Delete Lane")
        width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width : Ui.Metrics.dialogCompactWidth)
        Column {
            width: parent.width
            spacing: Ui.Metrics.md
            Ui.Text {
                width: parent.width
                text: qsTr("Delete this controller lane and its events?")
                wrapMode: Text.Wrap
                role: Ui.Typography.SansBody
            }
            Row {
                spacing: Ui.Metrics.sm
                Ui.EditorButton {
                    text: qsTr("Cancel")
                    onClicked: deleteDialog.close()
                }
                Ui.EditorButton {
                    text: qsTr("Delete")
                    variant: Ui.EditorButton.Destructive
                    onClicked: {
                        root.deleteLane(true);
                        deleteDialog.close();
                    }
                }
            }
        }
    }
}

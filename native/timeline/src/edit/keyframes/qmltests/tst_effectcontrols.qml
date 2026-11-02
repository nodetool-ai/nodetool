import QtQuick
import QtTest
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: host
    width: 1200
    height: 640
    property var timeline: testTimeline
    property var clock: testClock
    property var gestures: testGestures

    SignalSpy { id: clipSignals; target: testTimeline; signalName: "clipsChanged" }

    Component { id: panelComponent; EffectControlsPanel { anchors.fill: parent } }
    Component { id: inspectorComponent; ClipInspectorController { timeline: testTimeline; clock: testClock; clipId: "c" } }

    TestCase {
        id: test
        name: "EffectControlsPanel"
        when: windowShown
        property var panel: null
        property var controller: null

        function keyframe(row, ms, value, input) {
            controller.write({action: "input", row: row, input: input || 0, value: value, atMs: ms})
        }
        // Position keyed at 0 and 1000 with X from 0 to 100.
        function keyPosition() {
            controller.write({action: "stopwatch", row: "position", atMs: 0})
            keyframe("position", 1000, 100)
        }
        function init() {
            testClock.durationMs = 2000
            testHarness.reset()
            testGestures.keyframeRow = "opacity"
            panel = createTemporaryObject(panelComponent, host)
            testGestures.selection = ["c"]
            tryVerify(() => panel.hasClip)
            controller = panel.controller
            waitForRendering(panel)
        }
        function cleanup() {
            testGestures.selection = []
            testClock.durationMs = 2000
        }
        function child(name) {
            const found = findChild(panel, name)
            verify(found, name)
            return found
        }
        function center(item) { return item.mapToItem(host, item.width / 2, item.height / 2) }
        function times(row) { return Array.from(controller.rowDocument(row).times) }
        function click(item) {
            const p = center(item)
            mouseClick(host, p.x, p.y)
        }
        function drag(item, dx, dy, modifiers) {
            const p = center(item)
            mousePress(host, p.x, p.y, Qt.LeftButton, modifiers || Qt.NoModifier)
            mouseMove(host, p.x + dx / 2, p.y + (dy || 0) / 2)
            mouseMove(host, p.x + dx, p.y + (dy || 0))
            return {x: p.x + dx, y: p.y + (dy || 0)}
        }
        function laneX(ms) { return panel.laneX + panel.xOf(ms) }

        function test_groupsForAPictureClip() {
            child("effectControlsGroup_motion")
            child("effectControlsGroup_opacity")
            verify(!findChild(panel, "effectControlsGroup_volume"))
            child("effectControlsRow_position")
            child("effectControlsRow_scale")
            child("effectControlsRow_rotation")
            child("effectControlsRow_opacity")
            verify(!findChild(panel, "effectControlsRow_cameraZoom"))
        }
        function test_rowsFollowTheClipsEffects() {
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {effects: [{id: "e1", type: "blur", enabled: true, radius: 4}]}})
            tryVerify(() => findChild(panel, "effectControlsGroup_effect:e1"))
            const toggle = child("effectControlsEnable_effect:e1")
            verify(toggle.checked)
            const before = testHarness.undoCount()
            click(toggle)
            compare(testHarness.undoCount(), before + 1)
            compare(controller.clip.effects[0].enabled, false)
            testTimeline.undoStack.undo()
            compare(controller.clip.effects[0].enabled, true)
            tryCompare(toggle, "checked", true)
        }
        function test_soundClipListsVolumeAndItsEffects() {
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {mediaType: "audio", volumeDb: -6, audioEffects: [{id: "ae", type: "gain", enabled: true, gainDb: 2}]}})
            tryVerify(() => findChild(panel, "effectControlsGroup_volume"))
            waitForRendering(panel)
            child("effectControlsGroup_audioEffect:ae")
            verify(!findChild(panel, "effectControlsGroup_motion"))
            verify(!findChild(panel, "effectControlsGroup_opacity"))
            const count = testHarness.undoCount()
            const input = child("effectControlsVolumeInput")
            compare(input.value, "-6.0")
            input.commit("-3.0")
            compare(controller.clip.volumeDb, -3)
            compare(testHarness.undoCount(), count + 1)
            const toggle = child("effectControlsEnable_volume")
            click(toggle)
            compare(testHarness.undoCount(), count + 2)
            compare(controller.clip.volumeDb, undefined)
            verify(input.disabled)
            // A switched-off value stays on show.
            compare(input.value, "-3.0")
            click(toggle)
            compare(controller.clip.volumeDb, -3)
            const effect = child("effectControlsEnable_audioEffect:ae")
            click(effect)
            compare(controller.clip.audioEffects[0].enabled, false)
            compare(testHarness.undoCount(), count + 4)
        }
        function test_emptyStates() {
            testGestures.selection = []
            tryVerify(() => !panel.hasClip)
            compare(child("effectControlsEmpty").title, "No clip selected")
        }
        function test_retimeThroughADiamond() {
            keyPosition()
            const before = testHarness.documentJson()
            const count = testHarness.undoCount()
            testClock.seek(300)
            const mark = child("effectControlsDiamond_position_1000")
            const end = drag(mark, 0)
            // 1500 ms, over the frame-snapped lane.
            mouseMove(host, laneX(1500), end.y)
            compare(testHarness.documentJson(), before)
            compare(testHarness.undoCount(), count)
            verify(Math.abs(mark.shownMs - 1500) <= 17)
            mouseRelease(host, laneX(1500), end.y)
            compare(testHarness.undoCount(), count + 1)
            const moved = times("position")
            compare(moved.length, 2)
            verify(Math.abs(moved[1] - 1500) <= 17)
            // A retime leaves the playhead alone, and the Inspector's controller reads the same keys.
            compare(testClock.time, 300)
            const inspector = createTemporaryObject(inspectorComponent, host)
            compare(Array.from(inspector.rowState("position").times), moved)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
            compare(times("position"), [0, 1000])
        }
        function test_pressAloneSelectsAndChangesNothing() {
            keyPosition()
            const count = testHarness.undoCount()
            testClock.seek(300)
            click(child("effectControlsDiamond_position_1000"))
            verify(panel.isSelected("position", 1000))
            compare(panel.activeRow, "position")
            compare(testClock.time, 300)
            compare(testHarness.undoCount(), count)
        }
        function test_multiSelectMovesTogetherAndStopsAtTheClip() {
            keyPosition()
            keyframe("position", 500, 50)
            const count = testHarness.undoCount()
            const a = child("effectControlsDiamond_position_500")
            const b = child("effectControlsDiamond_position_1000")
            let p = center(a)
            mouseClick(host, p.x, p.y)
            p = center(b)
            mouseClick(host, p.x, p.y, Qt.LeftButton, Qt.ControlModifier)
            compare(panel.selectedCount, 2)
            // Past the end of the clip the pair stops with its later key on the last ms.
            const end = drag(b, 0)
            mouseMove(host, laneX(1999), end.y)
            mouseMove(host, host.width - 2, end.y)
            mouseRelease(host, host.width - 2, end.y)
            compare(testHarness.undoCount(), count + 1)
            const moved = times("position")
            compare(moved, [0, 1500, 2000])
            compare(panel.selectedCount, 2)
            verify(panel.isSelected("position", 2000))
            testTimeline.undoStack.undo()
            compare(times("position"), [0, 500, 1000])
        }
        function test_marqueeDeleteAndEasingAreOneStepEach() {
            keyPosition()
            controller.write({action: "stopwatch", row: "rotation", atMs: 0})
            keyframe("rotation", 1000, 1)
            const count = testHarness.undoCount()
            const position = child("effectControlsDiamond_position_1000")
            const rotation = child("effectControlsDiamond_rotation_1000")
            const from = center(position)
            const to = center(rotation)
            mousePress(host, from.x - 30, from.y - 8)
            mouseMove(host, from.x - 10, from.y)
            mouseMove(host, to.x + 30, to.y + 8)
            verify(child("effectControlsMarquee").visible)
            mouseRelease(host, to.x + 30, to.y + 8)
            compare(panel.selectedCount, 2)
            panel.easeSelection("hold")
            compare(testHarness.undoCount(), count + 1)
            compare(controller.easingAt("position", 1000), "hold")
            compare(controller.easingAt("rotation", 1000), "hold")
            panel.forceActiveFocus()
            keyClick(Qt.Key_Delete)
            compare(testHarness.undoCount(), count + 2)
            compare(times("position"), [0])
            compare(times("rotation"), [0])
            compare(panel.selectedCount, 0)
            testTimeline.undoStack.undo()
            compare(times("position"), [0, 1000])
        }
        function test_diamondMenuActsOnTheSelection() {
            keyPosition()
            keyframe("position", 500, 50)
            const a = child("effectControlsDiamond_position_500")
            const b = child("effectControlsDiamond_position_1000")
            click(a)
            const p = center(b)
            mouseClick(host, p.x, p.y, Qt.LeftButton, Qt.ControlModifier)
            mouseClick(host, p.x, p.y, Qt.RightButton)
            compare(panel.selectedCount, 2)
            const menu = panel.menu
            tryCompare(menu, "opened", true)
            compare(menu.checkedEasing, "linear")
            const count = testHarness.undoCount()
            const item = menu.itemAt(4)
            compare(item.text, "Hold")
            mouseClick(item)
            compare(testHarness.undoCount(), count + 1)
            compare(controller.easingAt("position", 500), "hold")
            compare(controller.easingAt("position", 1000), "hold")
            tryCompare(menu, "opened", false)
        }
        function test_escapeAbandonsADrag() {
            keyPosition()
            const count = testHarness.undoCount()
            const mark = child("effectControlsDiamond_position_1000")
            const end = drag(mark, 100)
            panel.forceActiveFocus()
            keyClick(Qt.Key_Escape)
            verify(!panel.retiming)
            mouseRelease(host, end.x, end.y)
            compare(testHarness.undoCount(), count)
            compare(times("position"), [0, 1000])
        }
        function test_handleChangesEasingInOneStep() {
            keyPosition()
            click(child("effectControlsGraphs_position"))
            const handle = child("effectControlsHandle_position_0_out")
            waitForRendering(panel)
            const before = testHarness.documentJson()
            const count = testHarness.undoCount()
            verify(handle.visible)
            compare(controller.easingAt("position", 1000), "linear")
            const end = drag(handle, 60, -20)
            verify(controller.easingAt("position", 1000).indexOf("cubic-bezier(") === 0)
            compare(testHarness.undoCount(), count)
            mouseRelease(host, end.x, end.y)
            compare(testHarness.undoCount(), count + 1)
            const easing = controller.easingAt("position", 1000)
            verify(easing.indexOf("cubic-bezier(") === 0, easing)
            verify(controller.validEasing(easing), easing)
            // The curve now reads the handle: halfway through the segment X left the straight line.
            const shown = controller.rowGraph("position", 0, 1000, 10).curves[0].values[5]
            verify(Math.abs(shown - 50) > 1, String(shown))
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
            compare(controller.easingAt("position", 1000), "linear")
        }
        function test_holdHasNoHandles() {
            keyPosition()
            controller.write({action: "easing", row: "position", atMs: 1000, easing: "hold"})
            click(child("effectControlsGraphs_position"))
            verify(!child("effectControlsHandle_position_0_out").visible)
        }
        function test_escapeAbandonsAHandle() {
            keyPosition()
            click(child("effectControlsGraphs_position"))
            const handle = child("effectControlsHandle_position_0_in")
            waitForRendering(panel)
            const before = testHarness.documentJson()
            const count = testHarness.undoCount()
            const end = drag(handle, -40, 10)
            panel.forceActiveFocus()
            keyClick(Qt.Key_Escape)
            mouseRelease(host, end.x, end.y)
            compare(testHarness.undoCount(), count)
            compare(testHarness.documentJson(), before)
        }
        // Backlog B13.
        function test_pastTheEndShowsTheEndpointAndAWorkingPrevious() {
            keyPosition()
            testClock.durationMs = 5000
            testClock.seek(3000)
            tryCompare(child("effectControls_position_input_0"), "value", "100")
            const previous = child("effectControlsPrev_position")
            const next = child("effectControlsNext_position")
            verify(previous.enabled)
            verify(!next.enabled)
            verify(!child("effectControlsPlayheadLine").visible)
            click(previous)
            compare(testClock.time, 1000)
        }
        function test_pressAnywhereOnARowMakesItActive() {
            compare(panel.activeRow, "opacity")
            const area = child("effectControlsRowArea_position")
            const label = area.mapToItem(host, Ui.Metrics.xxxl + Ui.Metrics.xxxl, area.height / 4)
            mouseClick(host, label.x, label.y)
            compare(panel.activeRow, "position")
            const input = child("effectControls_rotation_input_0")
            click(input)
            compare(panel.activeRow, "rotation")
        }
        function test_keyframeToggleAndNavigator() {
            controller.write({action: "stopwatch", row: "scale", atMs: 0})
            const count = testHarness.undoCount()
            testClock.seek(500)
            click(child("effectControlsToggle_scale"))
            compare(testHarness.undoCount(), count + 1)
            compare(times("scale"), [0, 500])
            click(child("effectControlsPrev_scale"))
            compare(testClock.time, 0)
            click(child("effectControlsNext_scale"))
            compare(testClock.time, 500)
            compare(panel.activeRow, "scale")
        }
        function test_rulerMovesThePlayhead() {
            const area = child("effectControlsRulerArea")
            const p = area.mapToItem(host, 0, area.height / 2)
            mousePress(host, laneX(1000), p.y)
            verify(Math.abs(testClock.time - 1000) <= 17)
            mouseMove(host, laneX(1500), p.y)
            verify(Math.abs(testClock.time - 1500) <= 17)
            mouseRelease(host, laneX(1500), p.y)
            tryVerify(() => child("effectControlsPlayheadLine").visible)
        }
        function test_zoomAndScrollStayInThePanel() {
            keyPosition()
            const mark = child("effectControlsDiamond_position_1000")
            const pxBefore = panel.pxPerMs
            const atMs = 1000
            const x = laneX(atMs)
            mouseWheel(host, x, center(mark).y, 0, 120, Qt.NoButton, Qt.ControlModifier)
            verify(panel.pxPerMs > pxBefore)
            verify(panel.visibleMs < 2000)
            // The time under the pointer stays there.
            verify(Math.abs(laneX(atMs) - x) < 1)
            verify(testGestures.viewState === null || testGestures.viewState.msPerPx === testGestures.viewState.msPerPx)
            const scrollBefore = panel.scrollMs
            mouseWheel(host, x, center(mark).y, 0, -120, Qt.NoButton, Qt.ShiftModifier)
            verify(panel.scrollMs > scrollBefore)
            click(child("effectControlsZoomFit"))
            compare(panel.visibleMs, 2000)
            compare(panel.scrollMs, 0)
            click(child("effectControlsZoomIn"))
            verify(panel.visibleMs < 2000)
            click(child("effectControlsZoomOut"))
            compare(panel.visibleMs, 2000)
        }
        function test_dividerResizesBothColumns() {
            const divider = child("effectControlsDivider")
            const before = panel.listWidth
            const end = drag(divider, 80)
            mouseRelease(host, end.x, end.y)
            verify(Math.abs(panel.listWidth - before - 80) <= 4, panel.listWidth + " " + before)
            // It stops before either side vanishes.
            const stop = drag(divider, 4000)
            mouseRelease(host, stop.x, stop.y)
            verify(panel.laneWidth >= panel.minLaneWidth - 1)
        }
        function test_collapseHidesRows() {
            const row = child("effectControlsRow_position")
            verify(row.visible)
            click(child("effectControlsCollapse_motion"))
            tryCompare(row, "visible", false)
            click(child("effectControlsCollapse_motion"))
            tryCompare(row, "visible", true)
        }
        function test_motionSwitchBypassesAndComesBack() {
            keyPosition()
            const count = testHarness.undoCount()
            const toggle = child("effectControlsEnable_motion")
            verify(toggle.checked)
            click(toggle)
            compare(testHarness.undoCount(), count + 1)
            verify(!controller.groupEnabled("motion"))
            verify(!toggle.checked)
            // The row still shows what it holds, and refuses edits while off.
            compare(times("position"), [0, 1000])
            verify(!child("effectControlsToggle_position").enabled)
            verify(controller.clip.bypassedFixedEffects.motion !== undefined)
            click(toggle)
            compare(testHarness.undoCount(), count + 2)
            verify(controller.groupEnabled("motion"))
            compare(controller.clip.bypassedFixedEffects, undefined)
            compare(times("position"), [0, 1000])
            testTimeline.undoStack.undo()
            testTimeline.undoStack.undo()
            tryCompare(toggle, "checked", true)
        }
        function test_seekChangesNoModelOrDelegate() {
            keyPosition()
            const mark = child("effectControlsDiamond_position_1000")
            clipSignals.clear()
            const revision = controller.revision
            for (let ms = 0; ms <= 2000; ms += 100) {
                testClock.seek(ms)
            }
            compare(clipSignals.count, 0)
            compare(controller.revision, revision)
            compare(child("effectControlsDiamond_position_1000"), mark)
        }
        function findItem(item, predicate) {
            if (predicate(item)) return item
            for (const entry of item.children || []) {
                const found = findItem(entry, predicate)
                if (found) return found
            }
            return null
        }
        // In the real editor: the panel is a tab beside the Inspector, its key opens it, and
        // Alt+K and the navigation keys act on its active row wherever the focus is.
        function test_mountedInTheEditor() {
            const component = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml")
            compare(component.status, Component.Ready, component.errorString())
            const editor = createTemporaryObject(component, host, {timeline: testTimeline, clock: testClock, width: host.width, height: host.height})
            verify(editor)
            let mounted = null
            tryVerify(() => {
                mounted = findItem(editor, item => item.objectName === "effectControlsPanel")
                return mounted !== null
            })
            editor.dockStore.switchWorkspace(0)
            editor.dockStore.resetWorkspace()
            verify(editor.dockStore.layout.regions.right[0].panels.indexOf("effectControls") >= 0)
            verify(!mounted.visible)
            const tracks = findChild(editor, "tracksRegion")
            const gestures = tracks.gestures
            gestures.selection = ["c"]
            verify(gestures.runAction("panelEffectControls"))
            tryVerify(() => editor.dockCanvas.visiblePanels.indexOf("effectControls") >= 0)
            tryVerify(() => mounted.visible && mounted.hasClip && mounted.width > 0)
            tryCompare(gestures, "keyframeRowOnly", true)
            // The rotation key is on another row, so the position row's navigation must not reach it.
            const write = mounted.controller
            write.write({action: "stopwatch", row: "rotation", atMs: 1500})
            const row = findChild(mounted, "effectControlsRowArea_position")
            tryVerify(() => row !== null && row.visible && row.width > 0)
            waitForRendering(mounted)
            const p = row.mapToItem(host, Ui.Metrics.xxxl + Ui.Metrics.xxxl, row.height / 4)
            mouseClick(host, p.x, p.y)
            compare(gestures.keyframeRow, "position")
            const count = testHarness.undoCount()
            testClock.seek(500)
            keyClick(Qt.Key_K, Qt.AltModifier)
            compare(testHarness.undoCount(), count + 1)
            compare(Array.from(write.rowDocument("position").times), [500])
            compare(Array.from(write.rowDocument("rotation").times), [1500])
            testClock.seek(0)
            keyClick(Qt.Key_K, Qt.AltModifier | Qt.ShiftModifier)
            compare(testClock.time, 500)
            keyClick(Qt.Key_K, Qt.AltModifier | Qt.ShiftModifier)
            compare(testClock.time, 500)
            testClock.seek(1000)
            keyClick(Qt.Key_K, Qt.ControlModifier | Qt.AltModifier | Qt.ShiftModifier)
            compare(testClock.time, 500)
            // Alt+K on the same frame takes the key off again, in one more step.
            keyClick(Qt.Key_K, Qt.AltModifier)
            compare(testHarness.undoCount(), count + 2)
            verify(!write.rowDocument("position").keyframed)
            // With the panel closed the navigation keys see every row again.
            editor.dockStore.dispatch({type: "hide", panelId: "effectControls"})
            tryCompare(gestures, "keyframeRowOnly", false)
            editor.forceActiveFocus()
            testClock.seek(0)
            keyClick(Qt.Key_K, Qt.AltModifier | Qt.ShiftModifier)
            compare(testClock.time, 1500)
            // Review keeps the side panels away, this one too, and Editing brings it back.
            editor.dockStore.dispatch({type: "reveal", panelId: "effectControls"})
            editor.dockStore.switchWorkspace(3)
            editor.dockStore.resetWorkspace()
            verify(editor.dockStore.layout.hidden.indexOf("effectControls") >= 0)
            editor.dockStore.switchWorkspace(0)
            editor.dockStore.resetWorkspace()
            verify(editor.dockStore.layout.hidden.indexOf("effectControls") < 0)
            // The layout is saved, and the next test file opens the Inspector tab.
            editor.dockStore.resetWorkspace()
            editor.dockStore.dispatch({type: "reveal", panelId: "inspector"})
        }
        function build100Keys() {
            const kfs = n => Array.from({length: n}, (_, i) => ({t: i / (n - 1), value: i % 7}))
            testTimeline.applyEdit("keyframes.animations", {clipId: "c", action: "animations", animations: [{
                id: "keys", role: "emphasis", preset: "custom", durationMs: 2000, delayMs: 0, enabled: true,
                params: {keyframed: true}, custom: {curves: [
                    {property: "offsetX", keyframes: kfs(100)}, {property: "offsetY", keyframes: kfs(100)},
                    {property: "scale", keyframes: kfs(100)}, {property: "rotation", keyframes: kfs(100)},
                    {property: "opacity", keyframes: kfs(100)}]}}]})
            compare(times("position").length, 100)
        }
        // A frame at 60 fps. The steps include the read-back of a whole frame, so each is
        // an upper bound on what one playhead tick, drag move or zoom step costs on screen.
        function test_a100KeyframeClipStaysWithinTheFrameBudget() {
            build100Keys()
            click(child("effectControlsGraphs_position"))
            waitForRendering(panel)
            const budget = 16.6
            // The best of three runs, since agents and CI share the machine.
            const best = (step, count) => {
                let result = Infinity
                for (let run = 0; run < 3 && result >= budget; ++run) {
                    result = Math.min(result, testHarness.medianFrameMs(panel, step, count))
                }
                return result
            }
            const seek = best(i => testClock.seek(i * 13), 41)
            panel.selectedKeys = {}
            for (const ms of times("position").slice(0, 50)) {
                panel.toggleSelected("position", ms)
            }
            panel.beginRetime(times("position")[10])
            let moved = 0
            const retime = best(i => { panel.updateRetime(panel.xOf(100 + i * 25)); moved = panel.retimeDeltaMs }, 41)
            verify(moved > 0)
            panel.endGestures()
            const zoom = best(i => panel.setView(1000 + (i % 10) * 100, 0), 21)
            console.info("frame ms: seek", seek, "retime", retime, "zoom", zoom)
            verify(seek < budget, "seek " + seek)
            verify(retime < budget, "retime " + retime)
            verify(zoom < budget, "zoom " + zoom)
        }
    }
}

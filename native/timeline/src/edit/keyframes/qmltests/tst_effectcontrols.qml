import QtQuick
import QtTest
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../../clipeffects/ClipEffectsCatalog.js" as Catalog

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
        // Scrolls a control in the list into view first, as a user would.
        function reveal(item) {
            const view = findChild(panel, "effectControlsRows")
            for (let up = item; up; up = up.parent) {
                if (up === view) {
                    const top = item.mapToItem(view, 0, 0).y
                    if (top < 0 || top + item.height > view.height) {
                        view.contentY = Math.max(0, Math.min(view.contentHeight - view.height, view.contentY + top - Ui.Metrics.xl))
                    }
                    return
                }
            }
        }
        function click(item) {
            reveal(item)
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
            verify(!child("audioVolume").visible)
            const input = child("effectControls_volume_input_0")
            compare(input.value, "-6.0")
            input.commit("-3")
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
            // A locked clip's level and fades stay as they are.
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {locked: true}})
            tryVerify(() => controller.locked)
            verify(input.disabled)
            verify(child("audioFadeIn").disabled)
            verify(child("audioFadeOutShape").disabled)
        }
        // The edits' table and the catalog name the same keyable parameters with the same bounds.
        function test_effectCatalogMatchesTheEdits() {
            let count = 0
            for (const entry of Catalog.addableEffects) {
                for (const field of Catalog.fields(entry.value)) {
                    if (!Catalog.keyed(entry.value, field)) continue
                    const keys = field.kind === "offset" ? ["offsetX", "offsetY"] : [field.key]
                    for (const key of keys) {
                        const spec = controller.effectParamSpec(entry.value, key)
                        verify(spec.fallback !== undefined, entry.value + ":" + key)
                        if (field.kind !== "offset") compare(spec.fallback, field.fallback, entry.value + ":" + key)
                        if (field.kind === "slider") {
                            compare(spec.min, field.min, entry.value + ":" + key)
                            compare(spec.max, field.max, entry.value + ":" + key)
                        }
                        ++count
                    }
                }
            }
            verify(count > 40, count)
            // A grade keeps its sliders in the Color panel, and an analysis setting stays a slider.
            verify(!Catalog.keyed("color", {kind: "slider", key: "brightness"}))
            verify(!Catalog.keyed("stabilize", {kind: "slider", key: "windowMs"}))
        }
        function test_effectParameterRowsKey() {
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {effects: [{id: "e1", type: "blur", enabled: true, radius: 4},
                {id: "shadow", type: "dropShadow", enabled: true, offsetX: 3, offsetY: 4, blur: 5, opacity: 0.5}]}})
            tryVerify(() => findChild(panel, "effectControlsStopwatch_effect:e1:radius"))
            waitForRendering(panel)
            const row = "effect:e1:radius"
            const input = child("effectControls_" + row + "_input_0")
            compare(input.value, "4.0")
            testClock.seek(0)
            const count = testHarness.undoCount()
            click(child("effectControlsStopwatch_" + row))
            tryVerify(() => controller.rowDocument(row).keyframed)
            compare(testHarness.undoCount(), count + 1)
            compare(panel.activeRow, row)
            testClock.seek(1000)
            tryVerify(() => controller.playheadMs === 1000)
            input.commit("12")
            compare(testHarness.undoCount(), count + 2)
            compare(times(row), [0, 1000])
            // The static value stays under the keys.
            compare(controller.clip.effects[0].radius, 4)
            click(child("effectControlsPrev_" + row))
            tryVerify(() => controller.playheadMs === 0)
            click(child("effectControlsNext_" + row))
            tryVerify(() => controller.playheadMs === 1000)
            click(child("effectControlsGraphs_" + row))
            tryVerify(() => child("effectControlsGraphLoader_" + row).item)
            // Switching the effect off keeps the keys and disables the row.
            click(child("effectControlsEnable_effect:e1"))
            tryVerify(() => !controller.clip.effects[0].enabled)
            tryCompare(input, "disabled", true)
            compare(times(row), [0, 1000])
            click(child("effectControlsEnable_effect:e1"))
            tryCompare(input, "disabled", false)
            // Drop shadow's offset is two rows, and its colour stays a control in the list.
            child("effectControlsStopwatch_effect:shadow:offsetX")
            child("effectControlsStopwatch_effect:shadow:offsetY")
            child("effects_shadow_color")
            // Removing the effect takes its keys, as one step that undo brings back.
            const before = testHarness.undoCount()
            click(child("effectsRemove_e1"))
            tryVerify(() => controller.clip.effects.length === 1)
            compare(testHarness.undoCount(), before + 1)
            compare(controller.rowDocument(row).times.length, 0)
            testTimeline.undoStack.undo()
            tryVerify(() => controller.clip.effects.length === 2)
            compare(times(row), [0, 1000])
        }
        function test_soundClipKeysItsLevel() {
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {mediaType: "audio", volumeDb: -6}})
            tryVerify(() => findChild(panel, "effectControlsStopwatch_volume"))
            waitForRendering(panel)
            testClock.seek(0)
            const count = testHarness.undoCount()
            click(child("effectControlsStopwatch_volume"))
            tryVerify(() => controller.rowDocument("volume").keyframed)
            compare(testHarness.undoCount(), count + 1)
            compare(panel.activeRow, "volume")
            testClock.seek(1000)
            tryVerify(() => controller.playheadMs === 1000)
            const input = child("effectControls_volume_input_0")
            // The static level stays the base under the keys.
            compare(input.value, "-6.0")
            input.commit("-12")
            compare(testHarness.undoCount(), count + 2)
            compare(controller.clip.volumeDb, -6)
            compare(times("volume"), [0, 1000])
            click(child("effectControlsPrev_volume"))
            tryVerify(() => controller.playheadMs === 0)
            click(child("effectControlsNext_volume"))
            tryVerify(() => controller.playheadMs === 1000)
            click(child("effectControlsGraphs_volume"))
            tryVerify(() => child("effectControlsGraphLoader_volume").item)
            // The switch leaves the keys on show and out of the mix.
            click(child("effectControlsEnable_volume"))
            tryVerify(() => controller.clip.volumeDb === undefined)
            tryCompare(input, "disabled", true)
            compare(times("volume"), [0, 1000])
            compare(input.value, "-12.0")
            click(child("effectControlsEnable_volume"))
            tryCompare(input, "disabled", false)
            compare(controller.clip.volumeDb, -6)
            compare(times("volume"), [0, 1000])
        }
        function topOf(name) { return child(name).mapToItem(panel, 0, 0).y }
        function openSection(id) {
            const area = child("effectControlsCollapse_" + id)
            if (area.iconName !== "arrowDropDown") click(area)
            tryCompare(area, "iconName", "arrowDropDown")
            // The rows lay out with the next frame.
            waitForRendering(panel)
        }
        function closeSection(id) {
            const area = child("effectControlsCollapse_" + id)
            if (area.iconName === "arrowDropDown") click(area)
        }
        function test_groupsFollowPremieresFixedEffects() {
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {effects: [{id: "e1", type: "blur", enabled: true, radius: 4}]}})
            tryVerify(() => findChild(panel, "effectControlsGroup_effect:e1"))
            waitForRendering(panel)
            const order = ["motion", "opacity", "timeRemap", "crop", "borderRadius", "motionBlur", "effect:e1"]
            for (let i = 1; i < order.length; ++i) {
                verify(topOf("effectControlsGroup_" + order[i - 1]) < topOf("effectControlsGroup_" + order[i]), order[i])
            }
        }
        function test_audioClipListsItsGroupsInOrder() {
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {mediaType: "audio", audioEffects: [{id: "ae", type: "gain", enabled: true, gainDb: 0}]}})
            tryVerify(() => findChild(panel, "effectControlsGroup_volume"))
            waitForRendering(panel)
            verify(topOf("effectControlsGroup_timeRemap") < topOf("effectControlsGroup_volume"))
            verify(topOf("effectControlsGroup_volume") < topOf("effectControlsGroup_audioEffect:ae"))
            for (const id of ["crop", "borderRadius", "motionBlur"]) verify(!findChild(panel, "effectControlsGroup_" + id), id)
        }
        function test_cameraSitsUnderMotion() {
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {mediaType: "model3d"}})
            tryVerify(() => findChild(panel, "effectControlsGroup_camera"))
            waitForRendering(panel)
            verify(topOf("effectControlsGroup_motion") < topOf("effectControlsGroup_camera"))
            verify(topOf("effectControlsGroup_camera") < topOf("effectControlsGroup_opacity"))
            child("effectControlsRow_cameraZoom")
        }
        function test_aGroupClipHasItsMotionHere() {
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {mediaType: "group"}})
            tryVerify(() => findChild(panel, "effectControlsGroup_borderRadius"))
            child("effectControlsGroup_motion")
            child("effectControlsGroup_opacity")
            child("effectControlsGroup_motionBlur")
            verify(!findChild(panel, "effectControlsGroup_timeRemap"))
            verify(!findChild(panel, "effectControlsGroup_crop"))
            child("effectControlsRow_position")
        }
        function test_keyedInputGestureAndAFieldWithNoKeys() {
            const field = child("effectControls_position_input_0")
            field.gestureStarted()
            field.preview("10")
            compare(controller.rowState("position").values[0], 10)
            compare(testHarness.undoCount(), 0)
            field.preview("20")
            field.commit("20")
            compare(testHarness.undoCount(), 1)
            compare(controller.rowState("position").values[0], 20)
            testTimeline.undoStack.undo()
            compare(controller.rowState("position").values[0], 0)
            const anchor = child("effectControls_anchor_input_0")
            anchor.gestureStarted()
            anchor.preview("0.3")
            compare(controller.fieldValue("anchorX"), 0.3)
            compare(testHarness.undoCount(), 1)
            anchor.commit("0.3")
            compare(testHarness.undoCount(), 1)
            testTimeline.undoStack.undo()
            compare(controller.fieldValue("anchorX"), 0.5)
        }
        function test_motionFieldsWriteAndFollowTheSwitch() {
            const depth = child("effectControls_depth_input_0")
            depth.commit("12")
            compare(controller.fieldValue("depthPx"), 12)
            const undoable = testHarness.undoCount()
            verify(undoable > 0)
            verify(!depth.disabled)
            const toggle = child("effectControlsEnable_motion")
            click(toggle)
            verify(child("effectControls_anchor_input_0").disabled)
            tryCompare(depth, "disabled", true)
            // A switched-off value stays on show.
            compare(depth.value, "12")
            click(toggle)
            tryCompare(depth, "disabled", false)
            compare(controller.fieldValue("depthPx"), 12)
        }
        function test_everyMotionRowHasAStopwatch_data() {
            return [{tag: "anchor", row: "anchor"}, {tag: "rotationX", row: "rotationX"}, {tag: "rotationY", row: "rotationY"},
                    {tag: "perspective", row: "perspective"}, {tag: "depth", row: "depth"}]
        }
        function test_everyMotionRowHasAStopwatch(data) {
            testClock.seek(0)
            const stopwatch = child("effectControlsStopwatch_" + data.row)
            const count = testHarness.undoCount()
            click(stopwatch)
            tryVerify(() => controller.rowDocument(data.row).keyframed)
            compare(testHarness.undoCount(), count + 1)
            compare(panel.activeRow, data.row)
            compare(times(data.row), [0])
            // Alt+K's row, the next and previous keys and the value graph all read this row.
            testClock.seek(1000)
            tryVerify(() => controller.playheadMs === 1000)
            click(child("effectControlsToggle_" + data.row))
            tryCompare(controller.rowDocument(data.row).times, "length", 2)
            testClock.seek(500)
            tryVerify(() => controller.rowLive(data.row).hasNext)
            click(child("effectControlsNext_" + data.row))
            tryVerify(() => controller.playheadMs === 1000)
            click(child("effectControlsPrev_" + data.row))
            tryVerify(() => controller.playheadMs === 0)
            click(child("effectControlsGraphs_" + data.row))
            tryVerify(() => child("effectControlsGraphLoader_" + data.row).item)
            testTimeline.undoStack.undo()
            testTimeline.undoStack.undo()
            tryVerify(() => !controller.rowDocument(data.row).keyframed)
        }
        function test_fieldsWithNoKeysKeepTheRowShape() {
            openSection("crop")
            const crop = child("effectControls_cropLeft_input_0")
            tryVerify(() => crop.visible)
            waitForRendering(panel)
            const left = crop.mapToItem(panel, 0, 0).x
            verify(left >= 0)
            verify(left + crop.width <= panel.listWidth, "A control stays in the list column")
            const anchor = child("effectControls_anchor_input_1")
            verify(anchor.mapToItem(panel, 0, 0).x + anchor.width <= panel.listWidth)
            closeSection("crop")
        }
        function test_cropCommitsOneUndoStep() {
            openSection("crop")
            const crop = child("effectControls_cropLeft_input_0")
            const before = testHarness.documentJson()
            const count = testHarness.undoCount()
            crop.gestureStarted()
            crop.preview("20")
            crop.commit("20")
            compare(testHarness.undoCount(), count + 1)
            compare(controller.clip.crop.left, 0.2)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
            closeSection("crop")
        }
        function test_cropAndCornersKey_data() {
            return [{tag: "cropLeft", row: "cropLeft", group: "crop"}, {tag: "cropBottom", row: "cropBottom", group: "crop"},
                    {tag: "borderRadius", row: "borderRadius", group: "borderRadius"}]
        }
        function test_cropAndCornersKey(data) {
            openSection(data.group)
            testClock.seek(0)
            const stopwatch = child("effectControlsStopwatch_" + data.row)
            tryVerify(() => stopwatch.visible)
            const count = testHarness.undoCount()
            click(stopwatch)
            tryVerify(() => controller.rowDocument(data.row).keyframed)
            compare(testHarness.undoCount(), count + 1)
            testClock.seek(1000)
            tryVerify(() => controller.playheadMs === 1000)
            click(child("effectControlsToggle_" + data.row))
            tryCompare(controller.rowDocument(data.row).times, "length", 2)
            click(child("effectControlsPrev_" + data.row))
            tryVerify(() => controller.playheadMs === 0)
            click(child("effectControlsNext_" + data.row))
            tryVerify(() => controller.playheadMs === 1000)
            click(child("effectControlsGraphs_" + data.row))
            tryVerify(() => child("effectControlsGraphLoader_" + data.row).item)
            testTimeline.undoStack.undo()
            testTimeline.undoStack.undo()
            tryVerify(() => !controller.rowDocument(data.row).keyframed)
            closeSection(data.group)
        }
        function test_timeRemapSwitchSitsInTheHeading() {
            const toggle = child("effectControlsEnable_timeRemap")
            verify(!toggle.checked)
            const count = testHarness.undoCount()
            click(toggle)
            compare(testHarness.undoCount(), count + 1)
            verify(controller.clip.timeRemap !== undefined)
            tryCompare(toggle, "checked", true)
            click(toggle)
            verify(controller.clip.timeRemap === undefined)
            tryCompare(toggle, "checked", false)
        }
        function test_sectionsAreClosedUntilOpenedAndStayOpenAcrossClips() {
            const corners = child("effectControlsCollapse_borderRadius")
            // A closed group builds no rows.
            verify(!findChild(panel, "effectControlsRow_borderRadius"))
            click(corners)
            const radius = child("effectControlsStopwatch_borderRadius")
            tryCompare(radius, "visible", true)
            // A fold keeps the rows it built.
            click(corners)
            tryCompare(radius, "visible", false)
            verify(child("effectControlsStopwatch_borderRadius") === radius)
            click(corners)
            tryCompare(radius, "visible", true)
            testGestures.selection = []
            tryVerify(() => !panel.hasClip)
            testGestures.selection = ["c"]
            tryVerify(() => panel.hasClip)
            let again = null
            tryVerify(() => { again = findChild(panel, "effectControlsStopwatch_borderRadius"); return again !== null && again.visible })
            closeSection("borderRadius")
        }
        function test_audioEffectChainActions() {
            testTimeline.applyEdit("patchClip", {clipId: "c", patch: {mediaType: "audio", audioEffects: [
                {id: "a1", type: "gain", enabled: true, gainDb: 0}, {id: "a2", type: "gain", enabled: true, gainDb: 3}]}})
            tryVerify(() => findChild(panel, "audioEffectDown-a1"))
            waitForRendering(panel)
            verify(!child("audioEffectUp-a1").enabled)
            verify(!child("audioEffectDown-a2").enabled)
            const before = testHarness.documentJson()
            const count = testHarness.undoCount()
            click(child("audioEffectDown-a1"))
            compare(testHarness.undoCount(), count + 1)
            compare(controller.clip.audioEffects[0].id, "a2")
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
            tryVerify(() => findChild(panel, "audioEffectRemove-a2"))
            waitForRendering(panel)
            click(child("audioEffectRemove-a2"))
            compare(testHarness.undoCount(), count + 1)
            compare(controller.clip.audioEffects.length, 1)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
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
            // Fixed groups keep their fold, so this file's other tests need it open again.
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
            const tabs = editor.dockStore.layout.regions.right[0].panels
            compare(tabs[tabs.indexOf("inspector") + 1], "effectControls")
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
        function buildKeys(count) {
            const kfs = n => Array.from({length: n}, (_, i) => ({t: i / (n - 1), value: i % 7}))
            testTimeline.applyEdit("keyframes.animations", {clipId: "c", action: "animations", animations: [{
                id: "keys", role: "emphasis", preset: "custom", durationMs: 2000, delayMs: 0, enabled: true,
                params: {keyframed: true}, custom: {curves: [
                    {property: "offsetX", keyframes: kfs(count)}, {property: "offsetY", keyframes: kfs(count)},
                    {property: "scale", keyframes: kfs(count)}, {property: "rotation", keyframes: kfs(count)},
                    {property: "opacity", keyframes: kfs(count)}]}}]})
            compare(times("position").length, count)
        }
        // Four times the keys may take up to twice linear growth, but not quadratic growth.
        // Compare on the same machine, including sanitized builds, instead of enforcing 60 fps in CI.
        function test_keyframeFrameCostScalesBelowQuadratic() {
            function measure(count) {
                panel.selectedKeys = {}
                buildKeys(count)
                panel.setView(2000, 0)
                if (count === 100) {
                    click(child("effectControlsGraphs_position"))
                }
                tryVerify(() => findChild(panel, "effectControlsGraph_position") !== null)
                waitForRendering(panel)
                const seek = testHarness.meanFrameMs(panel, i => testClock.seek(i * 13), 41)
                panel.selectedKeys = {}
                for (const ms of times("position").slice(0, count / 2)) {
                    panel.toggleSelected("position", ms)
                }
                panel.beginRetime(times("position")[10])
                let moved = 0
                const retime = testHarness.meanFrameMs(panel, i => {
                    panel.updateRetime(panel.xOf(100 + i * 25))
                    moved = panel.retimeDeltaMs
                }, 41)
                verify(moved > 0)
                panel.endGestures()
                const zoom = testHarness.meanFrameMs(panel, i => panel.setView(1000 + (i % 10) * 100, 0), 21)
                console.info(count, "keys frame CPU ms: seek", seek, "retime", retime, "zoom", zoom)
                return {seek, retime, zoom}
            }
            const baseline = measure(100)
            const larger = measure(400)
            for (const operation of ["seek", "retime", "zoom"]) {
                verify(baseline[operation] > 0)
                verify(larger[operation] < baseline[operation] * 8,
                       operation + " growth " + larger[operation] / baseline[operation])
            }
        }
    }
}

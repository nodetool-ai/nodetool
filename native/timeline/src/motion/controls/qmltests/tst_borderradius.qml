import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 640
    height: 400
    Component {
        id: controllerComponent
        ClipInspectorController { timeline: testTimeline; clock: testClock; clipId: "c" }
    }
    SignalSpy { id: changes; target: testTimeline; signalName: "clipsChanged" }
    SignalSpy { id: replacements; target: testTimeline; signalName: "timelineChanged" }
    TestCase {
        name: "BorderRadius"
        when: windowShown
        function init() { testHarness.reset() }
        function mount(controller) {
            const component = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/src/motion/controls/BorderRadius.qml")
            compare(component.status, Component.Ready, component.errorString())
            const panel = createTemporaryObject(component, host, {timelineModel:testTimeline, gestures:testGestures, controller:controller, width:host.width})
            verify(panel, component.errorString())
            return panel
        }
        function clip(id) { return JSON.parse(testHarness.documentJson()).clips.find(c => c.id === (id || "c")) }
        function test_sliderContractAndGesture() {
            const controller = createTemporaryObject(controllerComponent, host)
            const panel = mount(controller)
            const radius = findChild(panel, "borderRadiusSlider")
            verify(radius)
            compare(radius.label, "Radius")
            compare(radius.min, 0)
            compare(radius.max, 500)
            compare(radius.step, 1)
            compare(radius.origin, 0)
            compare(radius.value, 0)
            compare(radius.display, "0px")
            const before = testHarness.documentJson()
            radius.gestureStarted()
            radius.preview(10)
            radius.preview(35)
            compare(clip().borderRadius, 35)
            compare(testHarness.undoIndex(), 0)
            radius.change(40)
            compare(testHarness.undoIndex(), 1)
            compare(clip().borderRadius, 40)
            compare(clip().animations[0].params.unknown, 42)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
            testTimeline.undoStack.redo()
            compare(clip().borderRadius, 40)
        }
        function test_cancelSelectionAndDirectEdits() {
            const controller = createTemporaryObject(controllerComponent, host)
            const panel = mount(controller)
            let radius = findChild(panel, "borderRadiusSlider")
            const before = testHarness.documentJson()
            radius.gestureStarted()
            radius.preview(60)
            panel.cancel()
            compare(testHarness.documentJson(), before)
            compare(testHarness.undoIndex(), 0)
            radius.change(60)
            compare(testHarness.documentJson(), before)
            radius.gestureStarted()
            radius.preview(80)
            controller.clipId = "s"
            compare(testHarness.documentJson(), before)
            const oldRadius = radius
            radius = findChild(panel, "borderRadiusSlider")
            radius.change(8)
            compare(clip("s").borderRadius, 8)
            oldRadius.change(80)
            compare(clip("s").borderRadius, 8)
            verify(clip().borderRadius === undefined)
            testTimeline.undoStack.undo()
            controller.clipId = "c"
            radius = findChild(panel, "borderRadiusSlider")
            radius.change(12)
            compare(clip().borderRadius, 12)
            compare(testHarness.undoIndex(), 1)
            const after = testHarness.documentJson()
            for (const invalid of [-1, 501, NaN, Infinity]) radius.change(invalid)
            compare(testHarness.documentJson(), after)
            changes.clear()
            replacements.clear()
            for (const ms of [0, 800, 1400, 1999, 200, 0]) controller.seek(ms)
            compare(changes.count, 0)
            compare(replacements.count, 0)
            compare(testHarness.documentJson(), after)
            compare(testHarness.undoIndex(), 1)
        }
        function test_groupScopeAndUnknownFields() {
            testHarness.resetGroup()
            const controller = createTemporaryObject(controllerComponent, host, {clipId:"g"})
            const panel = mount(controller)
            verify(panel.visible)
            const before = testHarness.documentJson()
            const radius = findChild(panel, "borderRadiusSlider")
            radius.gestureStarted()
            radius.preview(20)
            radius.change(25)
            compare(clip("g").borderRadius, 25)
            compare(clip("g").unknownGroup, 73)
            compare(clip("g").repeater.unknown, 42)
            compare(testHarness.undoIndex(), 1)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
        }
        function test_visualScope() {
            const controller = createTemporaryObject(controllerComponent, host)
            const panel = mount(controller)
            verify(panel.visible)
            controller.clipId = "s"
            verify(panel.visible)
            for (const type of ["audio", "midi"]) {
                testTimeline.applyEdit("patchClip", {clipId:"s",patch:{mediaType:type}})
                verify(!panel.visible)
            }
            controller.clipId = "missing"
            verify(!panel.visible)
        }
    }
}

import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 640
    height: 900
    Component {
        id: inspectorController
        ClipInspectorController { timeline: testTimeline; clock: testClock; clipId: "g" }
    }
    SignalSpy { id: changes; target: testTimeline; signalName: "clipsChanged" }
    SignalSpy { id: replacements; target: testTimeline; signalName: "timelineChanged" }
    TestCase {
        name: "GroupMotion"
        when: windowShown
        property var panels: []
        function cleanup() {
            panels.forEach(panel => panel.destroy())
            panels = []
            wait(0)
        }
        function init() { testHarness.resetGroup() }
        function mount(url, controller) {
            const component = Qt.createComponent(url)
            compare(component.status, Component.Ready, component.errorString())
            const item = createTemporaryObject(component, host, {timelineModel:testTimeline, gestures:testGestures, controller:controller, width:host.width})
            verify(item, component.errorString())
            panels.push(item)
            return item
        }
        function group() { return JSON.parse(testHarness.documentJson()).clips.find(c => c.id === "g") }
        function test_numericGestureAndUnknownFields() {
            const controller = createTemporaryObject(inspectorController, host)
            const panel = mount("qrc:/qt/qml/NodeTool/Timeline/src/motion/controls/GroupMotion.qml", controller)
            const input = findChild(panel, "position-input-0")
            verify(input)
            const before = testHarness.documentJson()
            input.gestureStarted()
            input.preview("12")
            compare(testHarness.undoIndex(), 0)
            verify(testHarness.documentJson() !== before)
            input.commit("")
            compare(testHarness.documentJson(), before)
            compare(testHarness.undoIndex(), 0)
            input.gestureStarted()
            input.preview("12")
            input.preview("24")
            input.commit("24")
            compare(testHarness.undoIndex(), 1)
            compare(controller.rowState("position").values[0], 24)
            compare(group().unknownGroup, 73)
            compare(group().repeater.unknown, 42)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
            testTimeline.undoStack.redo()
            compare(controller.rowState("position").values[0], 24)
        }
        function test_animationLinksRepeaterAndSeek() {
            const controller = createTemporaryObject(inspectorController, host)
            const panel = mount("qrc:/qt/qml/NodeTool/Timeline/src/motion/controls/GroupMotion.qml", controller)
            const animations = findChild(panel, "groupAnimations")
            verify(animations)
            animations.patch("ga", {durationMs:900}, "")
            compare(testHarness.undoIndex(), 1)
            compare(group().animations[0].durationMs, 900)
            compare(group().animations[0].unknown, 23)
            const repeater = findChild(panel, "motionRepeater_count")
            verify(repeater)
            const before = testHarness.documentJson()
            repeater.gestureStarted()
            repeater.preview("3")
            compare(testHarness.undoIndex(), 1)
            findChild(panel, "groupAdvancedMotion").cancel()
            compare(testHarness.documentJson(), before)
            repeater.gestureStarted()
            repeater.preview("3")
            repeater.commit("4")
            compare(testHarness.undoIndex(), 2)
            compare(group().repeater.count, 4)
            compare(group().repeater.unknown, 42)
            compare(group().repeater.positionStep.unknown, 17)
            findChild(panel, "motionAddLink").clicked()
            compare(testHarness.undoIndex(), 3)
            compare(group().animationLinks.length, 1)
            findChild(panel, "motionLink_0_offset").commit("15")
            compare(testHarness.undoIndex(), 4)
            compare(group().animationLinks[0].offset, 15)
            compare(group().unknownGroup, 73)
            const after = testHarness.documentJson()
            changes.clear()
            replacements.clear()
            for (const ms of [0, 800, 1400, 1999, 200, 0]) controller.seek(ms)
            compare(changes.count, 0)
            compare(replacements.count, 0)
            compare(testHarness.undoIndex(), 4)
            compare(testHarness.documentJson(), after)
            testTimeline.undoStack.undo()
            testTimeline.undoStack.undo()
            testTimeline.undoStack.undo()
            testTimeline.undoStack.undo()
            compare(group().animations[0].durationMs, 800)
            compare(group().repeater.count, 2)
            verify(!group().animationLinks)
        }
        function test_componentAvailable() {
            const controller = createTemporaryObject(inspectorController, host)
            const panel = mount("qrc:/qt/qml/NodeTool/Timeline/src/motion/controls/GroupMotion.qml", controller)
            verify(findChild(panel, "groupMotionFields"))
            verify(findChild(panel, "groupAdvancedMotion"))
            verify(findChild(panel, "groupAnimations"))
        }
    }
}

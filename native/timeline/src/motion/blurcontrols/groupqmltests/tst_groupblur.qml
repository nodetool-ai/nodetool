import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 640; height: 900
    ClipInspectorController { id: controller; timeline:testTimeline; clock:testClock; clipId:"g" }
    SignalSpy { id: changes; target:testTimeline; signalName:"clipsChanged" }
    SignalSpy { id: replacements; target:testTimeline; signalName:"timelineChanged" }
    TestCase {
        name: "GroupMotionBlur"
        when: windowShown
        function test_groupBlur() {
            testHarness.resetGroup()
            const component = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/src/motion/controls/GroupMotion.qml")
            compare(component.status, Component.Ready, component.errorString())
            const panel = createTemporaryObject(component,host,{timelineModel:testTimeline,gestures:testGestures,controller:controller,width:host.width})
            verify(panel,component.errorString())
            const toggle = findChild(panel,"motionBlurEnabled")
            verify(toggle)
            const before = testHarness.documentJson()
            toggle.change(true)
            compare(testHarness.undoIndex(),1)
            testTimeline.applyEdit("patchClip",{clipId:"g",patch:{motionBlur:{samplesPerFrame:4,shutterAngle:180,unknown:91}}})
            const saved = testHarness.documentJson()
            const index = testHarness.undoIndex()
            const input = findChild(panel,"motionBlur_samplesPerFrame")
            verify(input)
            input.gestureStarted(); input.preview("8")
            compare(testHarness.undoIndex(),index)
            input.commit("8")
            compare(testHarness.undoIndex(),index+1)
            let group = JSON.parse(testHarness.documentJson()).clips.find(c => c.id === "g")
            compare(group.motionBlur.samplesPerFrame,8)
            compare(group.motionBlur.unknown,91)
            compare(group.unknownGroup,73)
            const after = testHarness.documentJson()
            changes.clear(); replacements.clear()
            for (const ms of [0,800,1400,1999,200,0]) controller.seek(ms)
            compare(changes.count,0); compare(replacements.count,0)
            compare(testHarness.documentJson(),after)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(),saved)
            testTimeline.undoStack.redo()
            compare(testHarness.documentJson(),after)
            testTimeline.undoStack.undo(); testTimeline.undoStack.undo(); testTimeline.undoStack.undo()
            compare(testHarness.documentJson(),before)
        }
    }
}

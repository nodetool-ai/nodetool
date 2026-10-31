import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 800; height: 600
    ClipInspectorController { id: controller; timeline: testTimeline; clipId: "c" }
    QtObject {
        id: lockProxy
        readonly property var clip: controller.clip
        property bool locked: false
        signal changed()
        onLockedChanged: changed()
    }
    TestCase {
        name: "MotionBlur"
        when: windowShown
        function test_editAndUndo() {
            testHarness.reset()
            const component = Qt.createComponent("../MotionBlur.qml")
            compare(component.status, Component.Ready, component.errorString())
            const section = createTemporaryObject(component, host, {timelineModel:testTimeline, controller:controller, width:host.width})
            verify(section, component.errorString())
            const toggle = findChild(section, "motionBlurEnabled")
            verify(toggle)
            const before = testHarness.documentJson()
            const index = testHarness.undoIndex()
            toggle.change(true)
            compare(testHarness.undoIndex(), index + 1)
            const authored = JSON.parse(testHarness.documentJson()).clips[0].motionBlur
            compare(authored.samplesPerFrame, 1)
            compare(authored.shutterAngle, 180)
            testTimeline.applyEdit("patchClip", {clipId:"c",patch:{motionBlur:{samplesPerFrame:4,shutterAngle:180,unknown:42}}})
            const saved = testHarness.documentJson()
            const baseIndex = testHarness.undoIndex()
            const angle = findChild(section, "motionBlur_shutterAngle")
            verify(angle)
            angle.commit("361"); angle.commit("-1"); angle.commit("")
            compare(testHarness.documentJson(), saved)
            compare(testHarness.undoIndex(), baseIndex)
            const samples = findChild(section, "motionBlur_samplesPerFrame")
            verify(samples)
            section.controller = lockProxy
            samples.gestureStarted()
            samples.preview("8")
            lockProxy.locked = true
            samples.commit("8")
            compare(testHarness.documentJson(), saved)
            compare(testHarness.undoIndex(), baseIndex)
            lockProxy.locked = false
            section.controller = controller
            samples.gestureStarted()
            samples.preview("8")
            compare(testHarness.undoIndex(), baseIndex)
            compare(JSON.parse(testHarness.documentJson()).clips[0].motionBlur.samplesPerFrame, 8)
            controller.clipId = "s"
            compare(testHarness.documentJson(), saved)
            compare(testHarness.undoIndex(), baseIndex)
            controller.clipId = "c"
            const fresh = findChild(section, "motionBlur_samplesPerFrame")
            verify(fresh)
            fresh.commit("6")
            compare(testHarness.undoIndex(), baseIndex + 1)
            compare(JSON.parse(testHarness.documentJson()).clips[0].motionBlur.unknown, 42)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), saved)
            fresh.gestureStarted()
            fresh.preview("9")
            fresh.commit("1.5")
            compare(testHarness.documentJson(), saved)
            compare(testHarness.undoIndex(), baseIndex)
            fresh.gestureStarted()
            fresh.preview("10")
            fresh.commit("10")
            compare(testHarness.undoIndex(), baseIndex + 1)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), saved)
            testTimeline.undoStack.undo()
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
        }
    }
}

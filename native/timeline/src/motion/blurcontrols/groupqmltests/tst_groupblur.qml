import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 640; height: 900
    property var timeline: testTimeline
    property var clock: testClock
    property var gestures: testGestures
    Component { id: effectControlsComponent; EffectControlsPanel { anchors.fill: parent } }
    ClipInspectorController { id: controller; timeline:testTimeline; clock:testClock; clipId:"g" }
    SignalSpy { id: changes; target:testTimeline; signalName:"clipsChanged" }
    SignalSpy { id: replacements; target:testTimeline; signalName:"timelineChanged" }
    TestCase {
        name: "GroupMotionBlur"
        when: windowShown
        function test_groupBlur() {
            testHarness.resetGroup()
            // A group's motion blur is in Effect Controls, like a clip's.
            const panel = createTemporaryObject(effectControlsComponent,host)
            testGestures.selection = ["g"]
            let toggle = null
            tryVerify(() => { toggle = findChild(panel,"motionBlurEnabled"); return toggle !== null })
            const before = testHarness.documentJson()
            toggle.change(true)
            compare(testHarness.undoIndex(),1)
            testTimeline.applyEdit("patchClip",{clipId:"g",patch:{motionBlur:{samplesPerFrame:4,shutterAngle:180,unknown:91}}})
            const saved = testHarness.documentJson()
            const index = testHarness.undoIndex()
            let input = null
            tryVerify(() => { input = findChild(panel,"motionBlur_samplesPerFrame"); return input !== null })
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

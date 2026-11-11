import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width:800; height:600
    ClipInspectorController { id: controller; timeline:testTimeline; clipId:"c" }
    ReframeController { id: reframe; model:testTimeline }
    TransitionController { id: transition; model:testTimeline }
    TestCase {
        name:"MotionBlurConcurrentEdit"
        when:windowShown
        function test_reframeExternalEdit() {
            testHarness.reset()
            reframe.beginGesture("patchClip",{clipId:"c",patch:{crop:{left:0.2}}})
            reframe.preview({})
            compare(JSON.parse(testHarness.documentJson()).clips[0].crop.left,0.2)
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{externalUnknown:42}})
            reframe.commit("patchClip",{clipId:"c",patch:{crop:{left:0.3}}})
            let clip = JSON.parse(testHarness.documentJson()).clips[0]
            compare(clip.externalUnknown,42)
            verify(!clip.crop || !clip.crop.left)
            testTimeline.undoStack.undo()
            clip = JSON.parse(testHarness.documentJson()).clips[0]
            verify(!clip.crop || !clip.crop.left)
            testTimeline.undoStack.redo()
            compare(JSON.parse(testHarness.documentJson()).clips[0].externalUnknown,42)
        }
        function test_transitionExternalEdit() {
            testHarness.reset()
            transition.beginGesture("patchClip",{clipId:"s",patch:{transitionIn:{softness:0.2}}})
            transition.preview({patch:{transitionIn:{softness:0.2}}})
            compare(JSON.parse(testHarness.documentJson()).clips[1].transitionIn.softness,0.2)
            testTimeline.applyEdit("patchClip",{clipId:"s",patch:{externalUnknown:42}})
            transition.commit("patchClip",{clipId:"s",patch:{transitionIn:{softness:0.3}}})
            let clip = JSON.parse(testHarness.documentJson()).clips[1]
            compare(clip.externalUnknown,42)
            verify(!clip.transitionIn)
            testTimeline.undoStack.undo()
            clip = JSON.parse(testHarness.documentJson()).clips[1]
            verify(!clip.transitionIn)
            testTimeline.undoStack.redo()
            compare(JSON.parse(testHarness.documentJson()).clips[1].externalUnknown,42)
        }
        function test_realCropAction() {
            testHarness.reset()
            reframe.beginGesture("setClipCropEdge",{clipId:"c",edge:"left"})
            reframe.preview({value:0.2})
            compare(JSON.parse(testHarness.documentJson()).clips[0].crop.left,0.2)
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{externalUnknown:42}})
            reframe.commit("setClipCropEdge",{value:0.3})
            let clip = JSON.parse(testHarness.documentJson()).clips[0]
            compare(clip.externalUnknown,42)
            verify(!clip.crop)
            testTimeline.undoStack.undo()
            verify(!JSON.parse(testHarness.documentJson()).clips[0].crop)
            testTimeline.undoStack.redo()
            compare(JSON.parse(testHarness.documentJson()).clips[0].externalUnknown,42)
        }
        function test_realTransitionAction() {
            testHarness.reset()
            verify(testTimeline.applyEdit("setClipTransition",{clipId:"s",mode:"wipe"}))
            const before = JSON.parse(testHarness.documentJson()).clips[1].transitionIn.softness || 0
            transition.beginGesture("setClipTransition",{clipId:"s",patch:{softness:before}})
            transition.preview({patch:{softness:0.2}})
            compare(JSON.parse(testHarness.documentJson()).clips[1].transitionIn.softness,0.2)
            testTimeline.applyEdit("patchClip",{clipId:"s",patch:{externalUnknown:42}})
            transition.commit("setClipTransition",{clipId:"s",patch:{softness:0.3}})
            let clip = JSON.parse(testHarness.documentJson()).clips[1]
            compare(clip.externalUnknown,42)
            compare(clip.transitionIn.softness || 0,before)
            testTimeline.undoStack.undo()
            clip = JSON.parse(testHarness.documentJson()).clips[1]
            compare(clip.transitionIn.softness || 0,before)
            testTimeline.undoStack.redo()
            compare(JSON.parse(testHarness.documentJson()).clips[1].externalUnknown,42)
        }
        function test_undoExternalEdit() {
            testHarness.reset()
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{motionBlur:{samplesPerFrame:4,shutterAngle:180}}})
            const component = Qt.createComponent("../MotionBlur.qml")
            compare(component.status,Component.Ready,component.errorString())
            const section = createTemporaryObject(component,host,{timelineModel:testTimeline,controller:controller,width:host.width})
            verify(section)
            const input = findChild(section,"motionBlur_samplesPerFrame")
            verify(input)
            input.gestureStarted(); input.preview("8")
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{externalUnknown:42}})
            section.cancel()
            testTimeline.undoStack.undo()
            const clip = JSON.parse(testHarness.documentJson()).clips[0]
            verify(clip.externalUnknown === undefined)
            compare(clip.motionBlur.samplesPerFrame,4)
            testTimeline.undoStack.redo()
            const redone = JSON.parse(testHarness.documentJson()).clips[0]
            compare(redone.motionBlur.samplesPerFrame,4)
            compare(redone.externalUnknown,42)
        }
        function test_explicitBlurEditWins() {
            testHarness.reset()
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{motionBlur:{samplesPerFrame:4,shutterAngle:180,unknown:11}}})
            const component = Qt.createComponent("../MotionBlur.qml")
            compare(component.status,Component.Ready,component.errorString())
            const section = createTemporaryObject(component,host,{timelineModel:testTimeline,controller:controller,width:host.width})
            const input = findChild(section,"motionBlur_samplesPerFrame")
            input.gestureStarted(); input.preview("8")
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{motionBlur:{samplesPerFrame:9,shutterAngle:180,unknown:11}}})
            section.cancel()
            compare(JSON.parse(testHarness.documentJson()).clips[0].motionBlur.samplesPerFrame,9)
            testTimeline.undoStack.undo()
            compare(JSON.parse(testHarness.documentJson()).clips[0].motionBlur.samplesPerFrame,4)
            testTimeline.undoStack.redo()
            compare(JSON.parse(testHarness.documentJson()).clips[0].motionBlur.samplesPerFrame,9)
        }
        function test_externalEditDuringPreview() {
            testHarness.reset()
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{motionBlur:{samplesPerFrame:4,shutterAngle:180}}})
            const component = Qt.createComponent("../MotionBlur.qml")
            compare(component.status,Component.Ready,component.errorString())
            const section = createTemporaryObject(component,host,{timelineModel:testTimeline,controller:controller,width:host.width})
            verify(section)
            const input = findChild(section,"motionBlur_samplesPerFrame")
            verify(input)
            input.gestureStarted(); input.preview("8")
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{externalUnknown:42}})
            section.cancel()
            let clip = JSON.parse(testHarness.documentJson()).clips[0]
            compare(clip.externalUnknown,42)
            compare(clip.motionBlur.samplesPerFrame,4)
            testTimeline.undoStack.undo()
            clip = JSON.parse(testHarness.documentJson()).clips[0]
            compare(clip.motionBlur.samplesPerFrame,4)
            verify(clip.externalUnknown === undefined)
        }
    }
}

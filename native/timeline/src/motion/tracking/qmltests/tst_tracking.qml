import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 640
    height: 600
    Component { id: controllerComponent; ClipInspectorController { timeline:testTimeline; clock:testClock; clipId:"c" } }
    SignalSpy { id: changes; target:testTimeline; signalName:"clipsChanged" }
    TestCase {
        name: "TrackBinding"
        when: windowShown
        function init() { testHarness.reset() }
        function mount(controller) {
            const component = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/src/motion/tracking/TrackBinding.qml")
            compare(component.status, Component.Ready, component.errorString())
            const panel = createTemporaryObject(component, host, {timelineModel:testTimeline, gestures:testGestures, controller:controller, width:host.width})
            verify(panel, component.errorString())
            return panel
        }
        function clip() { return JSON.parse(testHarness.documentJson()).clips.find(c => c.id === "c") }
        function test_bindUndoAndUnknown() {
            const controller = createTemporaryObject(controllerComponent, host)
            const panel = mount(controller)
            const before = testHarness.documentJson()
            findChild(panel,"followTrackId").commit("0123456789abcdef0123456789abcdef")
            findChild(panel,"followMode").change("position_scale")
            findChild(panel,"followBind").clicked()
            compare(clip().trackBinding.trackId,"0123456789abcdef0123456789abcdef")
            compare(clip().trackBinding.mode,"position_scale")
            compare(clip().animations[0].params.unknown,42)
            compare(testHarness.undoIndex(),1)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(),before)
            testTimeline.undoStack.redo()
            const binding = Object.assign({},clip().trackBinding,{unknownBinding:{retained:73}})
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{trackBinding:binding}})
            panel.change("offsetX",17)
            compare(clip().trackBinding.unknownBinding.retained,73)
            compare(clip().trackBinding.offset.x,17)
            compare(clip().trackBinding.offset.y,0)
            const unsupported = Object.assign({},clip().trackBinding,{mode:"mask"})
            testTimeline.applyEdit("patchClip",{clipId:"c",patch:{trackBinding:unsupported}})
            panel.change("trackId","  0123456789abcdef0123456789abcdef  ")
            compare(clip().trackBinding.mode,"position")
            compare(clip().trackBinding.trackId,"0123456789abcdef0123456789abcdef")
            compare(clip().trackBinding.unknownBinding.retained,73)
            panel.unbind()
            verify(!clip().trackBinding)
            testTimeline.undoStack.undo()
            compare(clip().trackBinding.offset.x,17)
        }
        function test_gestureCancellationAndSeek() {
            const controller = createTemporaryObject(controllerComponent, host)
            const panel = mount(controller)
            panel.change("trackId","track")
            panel.follow()
            wait(0)
            const slider = findChild(panel,"followsmoothing")
            verify(slider)
            slider.gestureStarted()
            slider.preview(0.4)
            compare(clip().trackBinding.smoothing,0.4)
            compare(testHarness.undoIndex(),1)
            slider.change(0.6)
            compare(clip().trackBinding.smoothing,0.6)
            compare(testHarness.undoIndex(),2)
            const saved = testHarness.documentJson()
            slider.gestureStarted()
            slider.preview(0.8)
            panel.cancel()
            compare(testHarness.documentJson(),saved)
            slider.change(0.9)
            compare(testHarness.documentJson(),saved)
            slider.gestureStarted()
            slider.preview(0.8)
            controller.clipId = "s"
            compare(testHarness.documentJson(),saved)
            slider.change(0.9)
            compare(testHarness.documentJson(),saved)
            controller.clipId = "c"
            panel.change("smoothing",2)
            compare(testHarness.documentJson(),saved)
            changes.clear()
            for (const time of [0,500,250,1000,0]) controller.seek(time)
            compare(changes.count,0)
            compare(testHarness.documentJson(),saved)
        }
    }
}

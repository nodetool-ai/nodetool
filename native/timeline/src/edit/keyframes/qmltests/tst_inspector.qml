import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 500
    height: 800
    property var timeline: testTimeline
    property var clock: testClock
    Item { property var gestures: testGestures }
    LaneClipModel { id: laneModel; timeline: testTimeline; trackId: "v" }
    TimelineInspector { id: panel; width: 360; height: 800 }
    TestCase {
        name: "InspectorPanel"
        when: windowShown
        function init() { testHarness.reset() }
        function test_presetDropsOptionalFields() {
            testGestures.selection = ["c"]
            const controller = findChild(panel,"clipInspectorController")
            tryCompare(controller,"clipId","c")
            controller.write({action:"animations",animations:[{id:"a",role:"in",preset:"custom",durationMs:800,custom:{curves:[]},params:{old:1},easing:"hold"}]})
            function findSection(item) {
                if (item.presetPatch !== undefined) return item
                const children = item.children || []
                for (let i = 0; i < children.length; ++i) { const found = findSection(children[i]); if (found) return found }
                return null
            }
            const section = findSection(panel)
            verify(section)
            section.patch("a",section.presetPatch("fade"),"")
            compare(controller.clip.animations[0].preset,"fade")
            compare(controller.clip.animations[0].custom,undefined)
            compare(controller.clip.animations[0].params,undefined)
        }
        function test_playheadLeavesLaneUntouched() {
            const recomputes = laneModel.recomputeCount
            const changedRows = laneModel.dataChangedRows
            testClock.seek(333)
            testClock.seek(1234)
            compare(laneModel.recomputeCount,recomputes)
            compare(laneModel.dataChangedRows,changedRows)
        }
        function test_emptyAndSingleSelection() {
            tryCompare(panel,"editor",host)
            compare(panel.selection.length,0)
            testGestures.selection = ["c"]
            const controller = findChild(panel,"clipInspectorController")
            tryCompare(controller,"clipId","c")
            compare(controller.clip.name,"Picture")
            testGestures.selection = ["c","other"]
            tryCompare(controller,"clipId","")
        }
        function test_pillGestureAndSlider() {
            testGestures.selection = ["c"]
            const controller = findChild(panel,"clipInspectorController")
            tryCompare(controller,"clipId","c")
            const field = findChild(panel,"position-input-0")
            verify(field)
            field.gestureStarted()
            field.preview("10")
            compare(controller.rowState("position").values[0],10)
            compare(testHarness.undoCount(),0)
            field.preview("20")
            field.commit("20")
            compare(testHarness.undoCount(),1)
            compare(controller.rowState("position").values[0],20)
            testTimeline.undoStack.undo()
            compare(controller.rowState("position").values[0],0)
            const slider = findChild(panel,"anchorX-slider")
            verify(slider)
            slider.gestureStarted()
            slider.preview(0.3)
            compare(controller.fieldValue("anchorX"),0.3)
            compare(testHarness.undoCount(),1)
            slider.change(0.3)
            compare(testHarness.undoCount(),1)
            testTimeline.undoStack.undo()
            compare(controller.fieldValue("anchorX"),0.5)
        }
    }
}

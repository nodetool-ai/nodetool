import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 400
    height: 120
    ClipInspectorController { id: inspector; timeline: testTimeline; clock: testClock; clipId: "c" }
    KeyframeLane {
        id: lane
        x: 20
        y: 20
        width: 300
        controller: inspector
        rowId: "position"
        timesMs: { const clip = inspector.clip; return inspector.rowState("position").times }
    }
    TestCase {
        name: "KeyframeLane"
        when: windowShown
        function init() {
            testHarness.reset()
            inspector.write({action:"stopwatch",row:"position"})
            testClock.seek(1000)
            inspector.write({action:"toggle",row:"position"})
            testClock.seek(0)
        }
        function test_dragSnapsAndCommitsOnce() {
            const mark = findChild(lane,"keyframe-diamond-position-0")
            verify(mark)
            const p = mark.mapToItem(host,mark.width/2,mark.height/2)
            mousePress(host,p.x,p.y)
            mouseMove(host,20+151,p.y)
            compare(testHarness.undoCount(),2)
            mouseRelease(host,20+151,p.y)
            compare(testHarness.undoCount(),3)
            compare(testClock.time,1000)
            compare(inspector.rowState("position").times.length,1)
            compare(inspector.rowState("position").times[0],1000)
            testTimeline.undoStack.undo()
            compare(inspector.rowState("position").times.length,2)
        }
        function test_seekAndDeleteKeyboard() {
            const mark = findChild(lane,"keyframe-diamond-position-1000")
            verify(mark)
            const p = mark.mapToItem(host,mark.width/2,mark.height/2)
            mouseClick(host,p.x,p.y)
            compare(testClock.time,1000)
            compare(testHarness.undoCount(),2)
            mark.forceActiveFocus()
            keyClick(Qt.Key_Delete)
            compare(testHarness.undoCount(),3)
            compare(inspector.rowState("position").times.length,1)
        }
    }
}

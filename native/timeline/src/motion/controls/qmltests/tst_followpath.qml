import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 1280
    height: 900
    TestCase {
        name: "FollowPathPicker"
        when: windowShown
        function test_selectShapeAndUndo() {
            testHarness.reset()
            const component = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml")
            compare(component.status, Component.Ready, component.errorString())
            const editor = createTemporaryObject(component, host, {timeline:testTimeline, clock:testClock, width:host.width, height:host.height})
            verify(editor, component.errorString())
            const tracks = findChild(editor, "tracksRegion")
            verify(tracks)
            tracks.gestures.selection = ["c"]
            let picker
            tryVerify(() => { picker = findChild(editor, "followPathShapePicker"); return picker !== null })
            tryCompare(picker, "count", 2)
            compare(picker.options[1].label, "Box")
            const before = testHarness.documentJson()
            const count = testHarness.undoCount()
            picker.currentIndex = 1
            picker.activated(1)
            compare(testHarness.undoCount(), count + 1)
            const params = JSON.parse(testHarness.documentJson()).clips[0].animations[0].params
            compare(params.d, "M0 0L1 0L1 1L0 1Z")
            compare(params.unknown, 42)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
        }
    }
}

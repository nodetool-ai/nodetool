import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    id: host
    width: 1280
    height: 900
    TestCase {
        name: "AdvancedMotion"
        when: windowShown
        function test_enableRepeaterAndUndo() {
            testHarness.reset()
            const component = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml")
            compare(component.status, Component.Ready, component.errorString())
            const editor = createTemporaryObject(component, host, {timeline:testTimeline, clock:testClock, width:host.width, height:host.height})
            verify(editor, component.errorString())
            findChild(editor, "tracksRegion").gestures.selection = ["c"]
            let toggle
            tryVerify(() => { toggle = findChild(editor, "motionRepeaterEnabled"); return toggle !== null })
            tryCompare(toggle, "disabled", false)
            const before = testHarness.documentJson()
            const count = testHarness.undoIndex()
            toggle.change(true)
            compare(testHarness.undoIndex(), count + 1)
            compare(JSON.parse(testHarness.documentJson()).clips[0].repeater.count, 2)
            testTimeline.applyEdit("patchClip", {clipId:"c",patch:{repeater:{count:2,positionStep:{x:0,y:0,unknown:17},timeStepMs:0,unknown:42}}})
            const gestureCount = testHarness.undoIndex()
            const number = findChild(editor, "motionRepeater_count")
            verify(number)
            const beforeGesture = testHarness.documentJson()
            number.gestureStarted()
            number.preview("3")
            findChild(editor, "tracksRegion").gestures.selection = ["s"]
            compare(testHarness.undoIndex(), gestureCount)
            compare(testHarness.documentJson(), beforeGesture)
            findChild(editor, "tracksRegion").gestures.selection = ["c"]
            tryVerify(() => findChild(editor, "motionRepeater_count") !== null)
            const nextNumber = findChild(editor, "motionRepeater_count")
            nextNumber.commit("4")
            compare(testHarness.undoIndex(), gestureCount + 1)
            compare(JSON.parse(testHarness.documentJson()).clips[0].repeater.count, 4)
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), beforeGesture)
            nextNumber.commit("1.5")
            compare(testHarness.undoIndex(), gestureCount)
            nextNumber.gestureStarted()
            nextNumber.preview("3")
            compare(testHarness.undoIndex(), gestureCount)
            nextNumber.commit("3")
            compare(testHarness.undoIndex(), gestureCount + 1)
            const editedRepeater = JSON.parse(testHarness.documentJson()).clips[0].repeater
            compare(editedRepeater.count, 3)
            compare(editedRepeater.unknown, 42)
            compare(editedRepeater.positionStep.unknown, 17)
            testTimeline.undoStack.undo()
            testTimeline.undoStack.undo()
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
            const echo = findChild(editor, "motionEchoEnabled")
            verify(echo)
            echo.change(true)
            verify(JSON.parse(testHarness.documentJson()).clips[0].temporalEcho)
            const echoCount = findChild(editor, "motionEcho_copies")
            const echoInterval = findChild(editor, "motionEcho_intervalMs")
            const echoDecay = findChild(editor, "motionEcho_opacityDecay")
            verify(echoCount && echoInterval && echoDecay)
            const echoBefore = testHarness.documentJson()
            echoCount.commit("0"); echoCount.commit("1.5"); echoCount.commit("33")
            echoInterval.commit("0"); echoDecay.commit("1.1")
            compare(testHarness.documentJson(), echoBefore)
            const addLink = findChild(editor, "motionAddLink")
            const addWiggle = findChild(editor, "motionAddWiggle")
            verify(addLink && addWiggle)
            addLink.clicked()
            addWiggle.clicked()
            const links = JSON.parse(testHarness.documentJson()).clips[0].animationLinks
            compare(links.length, 2)
            compare(links[1].kind, "wiggle")
            const frequency = findChild(editor, "motionLink_1_frequencyHz")
            verify(frequency)
            const linksBefore = testHarness.documentJson()
            frequency.commit("-1")
            compare(testHarness.documentJson(), linksBefore)
        }
    }
}

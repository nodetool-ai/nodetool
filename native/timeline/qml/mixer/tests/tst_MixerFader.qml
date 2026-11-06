import QtQuick
import QtTest
import ".."

TestCase {
    id: test
    name: "MixerFaderAdapter"
    width: 200
    height: 260
    visible: true
    when: windowShown
    MixerFader { id: fader; width: 56; height: 200; value: 0 }
    Item { id: otherFocus; x: 100; width: 20; height: 20; activeFocusOnTab: true }
    SignalSpy { id: previews; target: fader; signalName: "preview" }
    SignalSpy { id: commits; target: fader; signalName: "commit" }
    function init() {
        fader.value = 0
        previews.clear()
        commits.clear()
    }
    function input() { return findChild(fader, "mixerFaderInput") }
    function test_keyboardAndReset() {
        input().forceActiveFocus()
        keyClick(Qt.Key_Home)
        compare(commits.count, 1)
        compare(commits.signalArguments[0][0], -120)
        commits.clear()
        keyClick(Qt.Key_Delete)
        compare(commits.count, 1)
        compare(commits.signalArguments[0][0], 0)
        commits.clear()
        fader.value = 12
        keyClick(Qt.Key_End)
        compare(commits.count, 1)
        compare(commits.signalArguments[0][0], 12)
    }
    function test_focusLossCommitsOnce() {
        input().forceActiveFocus()
        keyPress(Qt.Key_Down)
        verify(previews.count > 0)
        otherFocus.forceActiveFocus()
        compare(commits.count, 1)
        keyRelease(Qt.Key_Down)
        compare(commits.count, 1)
    }
    function test_escapeCancelsPreview() {
        const control = input()
        mousePress(control, 10, 60)
        mouseMove(control, 10, 100, 10)
        verify(previews.count > 0)
        keyClick(Qt.Key_Escape)
        mouseRelease(control, 10, 100)
        compare(commits.count, 0)
        compare(fader.draft, fader.value)
    }
    function test_pointerDragAndDoubleClickReset() {
        const control = input()
        mousePress(control, 10, 60)
        mouseMove(control, 10, 100, 10)
        mouseRelease(control, 10, 100)
        verify(previews.count > 0)
        compare(commits.count, 1)
        commits.clear()
        mouseDoubleClickSequence(control, 10, 100)
        verify(commits.count >= 1)
        compare(commits.signalArguments[commits.count - 1][0], 0)
    }
}

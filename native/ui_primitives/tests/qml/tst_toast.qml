import QtQuick
import QtTest
import NodeTool.UiPrimitives as Ui

TestCase {
    id: test
    name: "Toast"
    when: windowShown
    visible: true
    width: 320
    height: 240
    Ui.Toast { id: toast; duration: 100 }
    function init() { Ui.Theme.reducedMotion = true; toast.hide() }
    function cleanup() { Ui.Theme.reducedMotion = false }
    function test_showReplacesAndHides() {
        verify(!toast.visible)
        toast.show("First")
        verify(toast.visible)
        toast.show("4 takes added. Take A1 is active.")
        compare(toast.message, "4 takes added. Take A1 is active.")
        compare(findChild(toast, "toastText").text, toast.message)
        compare(toast.Accessible.role, Accessible.AlertMessage)
        tryVerify(() => !toast.visible, 2000)
    }
}

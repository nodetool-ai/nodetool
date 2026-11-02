import QtQuick
import QtTest
import NodeTool.UiPrimitives as Ui

TestCase {
    name: "NumberAcceptance"
    visible: true
    when: windowShown
    width: 240
    height: 100
    Ui.NumberField { id: field; width: 160; value: 5; from: 0; to: 10 }
    SignalSpy { id: accepted; target: field; signalName: "accepted" }
    SignalSpy { id: committed; target: field; signalName: "valueCommitted" }

    function test_enterCommitsThenAcceptsOnlyValidDrafts() {
        field.forceActiveFocus()
        field.selectAll()
        keyClick(Qt.Key_7)
        keyClick(Qt.Key_Return)
        compare(committed.count, 1)
        compare(committed.signalArguments[0][0], 7)
        compare(accepted.count, 1)
        field.selectAll()
        keyClick(Qt.Key_Minus)
        keyClick(Qt.Key_Return)
        compare(committed.count, 1)
        compare(accepted.count, 1)
        keyClick(Qt.Key_Escape)
    }
}

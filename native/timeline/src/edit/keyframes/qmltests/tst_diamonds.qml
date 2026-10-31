import QtQuick
import QtTest
import NodeTool.Timeline
Item {
    width: 400
    height: 120
    TestCase {
        id: test
        name: "KeyframeClipDiamonds"
        when: windowShown
        SignalSpy { id: seeks; target: test.diamonds; signalName: "seek" }
        SignalSpy { id: moves; target: test.diamonds; signalName: "move" }
        Component { id: subject; KeyframeClipDiamonds { width: 400; height: 60; clipId: "c"; durationMs: 1000; msPerPx: 2.5; timesMs: [250,750] } }
        property var diamonds
        function init() {
            diamonds = createTemporaryObject(subject, test.parent)
            verify(diamonds)
            seeks.clear()
            moves.clear()
        }
        function diamond() { return findChild(diamonds, "clip-keyframe-c-250") }
        function test_clickSlop() {
            const mark = diamond()
            verify(mark)
            mousePress(mark, mark.width/2, mark.height/2)
            mouseMove(mark, mark.width/2 + 3, mark.height/2)
            mouseRelease(mark, mark.width/2 + 3, mark.height/2)
            compare(moves.count,0)
            compare(seeks.count,1)
            compare(seeks.signalArguments[0][0],250)
        }
        function test_fourPixelsRetimes() {
            const mark = diamond()
            const p = mark.mapToItem(diamonds,mark.width/2,mark.height/2)
            mousePress(diamonds,p.x,p.y)
            mouseMove(diamonds,p.x+4,p.y)
            mouseRelease(diamonds,p.x+4,p.y)
            compare(moves.count,1)
            compare(moves.signalArguments[0][1],260)
            compare(seeks.count,0)
        }
        function test_dragClamp() {
            const mark = diamond()
            const p = mark.mapToItem(diamonds,mark.width/2,mark.height/2)
            mousePress(diamonds,p.x,p.y)
            mouseMove(diamonds,390,p.y)
            mouseMove(diamonds,450,p.y)
            mouseRelease(diamonds,450,p.y)
            compare(moves.count,1)
            compare(moves.signalArguments[0][0],250)
            compare(moves.signalArguments[0][1],1000)
            compare(seeks.count,0)
        }
        function test_lockedSeeks() {
            diamonds.locked = true
            const mark = diamond()
            const p = mark.mapToItem(diamonds,mark.width/2,mark.height/2)
            mousePress(diamonds,p.x,p.y)
            mouseMove(diamonds,p.x + 30,p.y)
            mouseRelease(diamonds,p.x + 30,p.y)
            compare(moves.count,0)
            compare(seeks.count,1)
            compare(seeks.signalArguments[0][0],250)
        }
        function test_halfMillisecondSeeks() {
            diamonds.msPerPx = 0.1
            diamonds.durationMs = 20
            diamonds.timesMs = [5]
            const mark = findChild(diamonds,"clip-keyframe-c-5")
            const p = mark.mapToItem(diamonds,mark.width/2,mark.height/2)
            mousePress(diamonds,p.x,p.y)
            mouseMove(diamonds,p.x+4,p.y)
            mouseRelease(diamonds,p.x+4,p.y)
            compare(moves.count,0)
            compare(seeks.count,1)
            compare(seeks.signalArguments[0][0],5)
        }
        function test_keyboardSeeks() {
            const mark = diamond()
            mark.forceActiveFocus()
            keyClick(Qt.Key_Return)
            compare(seeks.count,1)
        }
    }
}

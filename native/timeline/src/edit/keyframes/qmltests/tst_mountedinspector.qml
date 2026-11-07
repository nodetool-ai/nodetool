import QtQuick
import QtTest
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: host
    width: 1280
    height: 900

    TestCase {
        name: "MountedInspector"
        when: windowShown

        function findItem(item, predicate) {
            if (predicate(item)) return item
            for (const child of item.children || []) {
                const found = findItem(child, predicate)
                if (found) return found
            }
            return null
        }

        function test_selectionTransformCommitAndUndo() {
            testHarness.reset()
            const component = Qt.createComponent("qrc:/qt/qml/NodeTool/Timeline/qml/TimelineEditor.qml")
            compare(component.status, Component.Ready, component.errorString())
            const editor = createTemporaryObject(component, host, {
                timeline: testTimeline, clock: testClock, width: host.width, height: host.height
            })
            verify(editor, component.errorString())
            const rightSlot = findChild(editor, "panelSlot_right")
            verify(rightSlot)
            let panel = null
            tryVerify(() => {
                panel = findItem(rightSlot, item => item.objectName === "timelineInspector")
                return panel !== null
            })
            verify(panel.width > 0 && panel.height > 0)
            const empty = findItem(panel, item => item.text === "No selection")
            verify(empty)
            tryCompare(empty, "visible", true)
            compare(panel.selection.length, 0)
            const tracks = findChild(editor, "tracksRegion")
            verify(tracks)
            const gestures = tracks.gestures
            verify(gestures)
            compare(gestures.selection.length, 0)
            gestures.selection = ["c"]
            const controller = findChild(panel, "clipInspectorController")
            verify(controller)
            tryCompare(controller, "clipId", "c")
            compare(controller.clip.mediaType, "video")
            compare(controller.clip.name, "Picture")
            tryCompare(empty, "visible", false)
            compare(panel.editor, editor)
            compare(panel.gestures, gestures)

            // Transform belongs to Effect Controls, one tab along. The Inspector has no copy of it.
            verify(!findItem(panel, item => item.title === "Transform" && item.open !== undefined))
            verify(!findChild(panel, "position-input-0"))
            verify(editor.focusPanel("effectControls"))
            const effectControls = findItem(rightSlot, item => item.objectName === "effectControlsPanel")
            verify(effectControls)
            tryVerify(() => effectControls.visible && effectControls.hasClip)
            let position = null
            tryVerify(() => {
                position = findChild(effectControls, "effectControls_position_input_0")
                return position !== null && position.visible
            })
            compare(position.disabled, false)
            compare(position.value, "0")
            const before = testHarness.documentJson()
            const count = testHarness.undoCount()
            verify(waitForRendering(position))
            mouseClick(position, position.width / 2, position.height / 2)
            const input = findItem(position, item => item.selectAll !== undefined)
            verify(input)
            tryCompare(input, "activeFocus", true)
            keyPress(Qt.Key_Up)
            keyPress(Qt.Key_Up)
            compare(testHarness.undoCount(), count)
            keyRelease(Qt.Key_Up)
            compare(testHarness.undoCount(), count + 1)
            const after = JSON.parse(testHarness.documentJson())
            compare(after.clips[0].id, "c")
            compare(after.clips[0].transform.position.x, 2)
            compare(position.value, "2")
            testTimeline.undoStack.undo()
            compare(testHarness.documentJson(), before)
            compare(position.value, "0")
            // The layout is saved, and the next test file opens the Inspector tab.
            editor.dockStore.dispatch({type: "reveal", panelId: "inspector"})
        }
    }
}

import QtQuick
import QtTest
import NodeTool.UiPrimitives as Ui

TestCase {
    name: "Tooltips"
    visible: true
    when: windowShown
    width: 400
    height: 240

    Ui.ToolbarIconButton {
        id: action
        x: 40
        y: 40
        iconName: "add"
        accessibleName: "Add keyframe"
        hoverEnabled: true
    }
    Ui.ToolbarIconButton {
        id: otherAction
        x: 140
        y: 40
        iconName: "add"
        accessibleName: "Other action"
        hoverEnabled: true
    }

    function cleanup() {
        mouseMove(action, -20, -20)
        otherAction.forceActiveFocus()
        action.description = ""
        action.shortcutText = ""
        action.x = 40
    }

    function test_redundantDescription() {
        action.description = action.accessibleName
        action.shortcutText = "K"
        mouseMove(action, action.width / 2, action.height / 2)
        const tip = findChild(action, "nativeButtonTooltip")
        tryVerify(() => tip.visible, 1500)
        compare(tip.text, "Add keyframe (K)")
        action.description = "Insert at the playhead"
        compare(tip.text, "Add keyframe (K)\nInsert at the playhead")
        action.shortcutText = "Shift+K"
        compare(tip.text, "Add keyframe (Shift+K)\nInsert at the playhead")
    }
}

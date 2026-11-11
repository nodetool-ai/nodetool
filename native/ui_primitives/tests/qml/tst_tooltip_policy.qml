import QtQuick
import QtTest
import NodeTool.UiPrimitives as Ui

TestCase {
    name: "TooltipPolicy"
    visible: true
    when: windowShown
    width: 400
    height: 240
    Item { id: scrollContent; width: parent.width; height: parent.height }
    Component { id: secondWindow; Window { width: 400; height: 240; visible: true } }
    Component {
        id: disabledRow
        Row {
            y: 100
            spacing: Ui.Metrics.micro
            Ui.ToolbarIconButton { objectName: "disabledAction"; iconName: "add"; accessibleName: "Add"; enabled: false; disabledReason: "Unlock the track" }
            Ui.ToolbarIconButton { objectName: "enabledAction"; iconName: "add"; accessibleName: "Other action" }
        }
    }

    Ui.ToolbarIconButton {
        id: action
        parent: scrollContent
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
        scrollContent.y = 0
        action.visible = true
        action.parent = scrollContent
    }

    function test_anchorRefreshesBeforeShow_data() {
        return [{tag: "dark", theme: Ui.Theme.Dark}, {tag: "light", theme: Ui.Theme.Light}]
    }
    function test_anchorRefreshesBeforeShow(data) {
        Ui.Theme.preference = data.theme
        action.x = 200
        waitForRendering(action)
        mouseMove(action, action.width / 2, action.height / 2)
        const tip = findChild(action, "nativeButtonTooltip")
        tryVerify(() => tip.visible, 1500)
        compare(tip.x, action.mapToItem(tip.parent, 0, action.height).x)
    }
    function test_pressDismissesHelp() {
        mouseMove(action, action.width / 2, action.height / 2)
        const tip = findChild(action, "nativeButtonTooltip")
        tryVerify(() => tip.visible, 1500)
        mousePress(action, action.width / 2, action.height / 2)
        tryVerify(() => !tip.visible)
        mouseRelease(action, action.width / 2, action.height / 2)
        wait(tip.delay * 2)
        verify(!tip.visible)
    }
    function test_hoverReplacesKeyboardHelp() {
        action.forceActiveFocus(Qt.TabFocusReason)
        const first = findChild(action, "nativeButtonTooltip")
        const second = findChild(otherAction, "nativeButtonTooltip")
        tryVerify(() => first.visible, 1500)
        mouseMove(otherAction, otherAction.width / 2, otherAction.height / 2)
        tryVerify(() => second.visible, 1500)
        verify(!first.visible)
    }
    function test_ancestorMovementDismissesHelp() {
        mouseMove(action, action.width / 2, action.height / 2)
        const tip = findChild(action, "nativeButtonTooltip")
        tryVerify(() => tip.visible, 1500)
        scrollContent.y = 30
        tryVerify(() => !tip.visible)
        mouseMove(action, -20, -20)
        mouseMove(action, action.width / 2, action.height / 2)
        tryVerify(() => tip.visible, 1500)
        compare(tip.y, action.mapToItem(tip.parent, 0, action.height).y)
        action.visible = false
        tryVerify(() => !tip.visible)
    }
    function test_reparentingUsesTheNewWindow() {
        const window = createTemporaryObject(secondWindow, null)
        verify(window)
        const tip = findChild(action, "nativeButtonTooltip")
        action.parent = window.contentItem
        tip.open()
        tryVerify(() => tip.visible, 1500)
        compare(tip.parent.Window.window, window)
        compare(tip.x, action.mapToItem(tip.parent, 0, action.height).x)
        tip.close()
        action.parent = scrollContent
    }
    function test_disabledHelpDoesNotParticipateInRowLayout() {
        const row = createTemporaryObject(disabledRow, scrollContent)
        verify(row)
        const disabled = findChild(row, "disabledAction")
        const enabled = findChild(row, "enabledAction")
        waitForRendering(row)
        compare(row.width, disabled.width + row.spacing + enabled.width)
        mouseMove(disabled, disabled.width / 2, disabled.height / 2)
        const tip = findChild(disabled, "nativeButtonTooltip")
        tryVerify(() => tip.visible, 1500)
        compare(tip.text, "Unlock the track")
    }
}

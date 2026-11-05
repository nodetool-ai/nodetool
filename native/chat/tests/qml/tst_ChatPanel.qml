import QtQuick
import QtQuick.Controls
import QtTest
import NodeTool.Chat
import NodeTool.UiPrimitives as Ui

TestCase {
    id: test
    name: "ChatPanel"
    when: windowShown
    visible: true
    width: 1100
    height: 760
    ChatPanel { id: panel; anchors.fill: parent; session: testSession; visible: !loadingView.active }
    QtObject {
        id: loadingSession
        property bool historyLoading: true
        property bool hasMoreHistory: false
        property string selectedThreadId: "loading"
        property string turnStatus: "idle"
        property string connectionStatus: "connected"
        property string draft: ""
        property string provider: ""
        property string model: ""
        property var messages: null
        property var attachments: []
        signal stateChanged()
    }
    Loader {
        id: loadingView
        anchors.fill: parent
        active: false
        sourceComponent: Component { ConversationView { session: loadingSession } }
    }
    function typeLetters(text) {
        for (let i = 0; i < text.length; ++i) keyClick(text[i].toUpperCase().charCodeAt(0))
    }
    function findVisible(item, name) {
        if (!item.visible) return null
        if (item.objectName === name) return item
        for (let i = 0; i < item.children.length; ++i) {
            const found = findVisible(item.children[i], name)
            if (found) return found
        }
        return null
    }
    function findText(item, text) {
        if (!item.visible) return null
        if (item.visible && item.text !== undefined && item.text === text) return item
        for (let i = 0; i < item.children.length; ++i) {
            const found = findText(item.children[i], text)
            if (found) return found
        }
        return null
    }
    function init() {
        loadingView.active = false
        loadingSession.historyLoading = true
        test.width = 1100
        testSession.selectThread("a")
        testSession.draft = ""
        testDriver.clearHistory("a")
        testDriver.clearHistory("b")
        wait(30)
    }
    function test_longToolConversationStaysVirtualized() {
        testDriver.toolHistory(2000)
        const list = findChild(panel, "chatMessages")
        tryCompare(list, "count", 2000)
        list.positionViewAtEnd()
        wait(50)
        verify(list.contentItem.children.length < 100)
        list.positionViewAtBeginning()
        wait(50)
        verify(findText(panel, "Read notes.txt") !== null)
    }
    function test_toolExpansionSurvivesRecycling() {
        testDriver.toolHistory(2000)
        const list = findChild(panel, "chatMessages")
        tryCompare(list, "count", 2000)
        list.positionViewAtBeginning()
        wait(80)
        const first = findVisible(panel, "message_0")
        verify(first !== null)
        mouseClick(findText(first, "Show details"))
        tryVerify(function() { return findText(first, "Arguments") !== null })
        list.positionViewAtEnd()
        wait(80)
        verify(list.contentItem.children.length < 100)
        const last = findVisible(panel, "message_1999")
        verify(last !== null)
        verify(findText(last, "Arguments") === null)
        list.positionViewAtBeginning()
        wait(80)
        const restored = findVisible(panel, "message_0")
        verify(restored !== null)
        verify(findText(restored, "Arguments") !== null)
        mouseClick(findText(restored, "Hide details"))
        tryVerify(function() { return findText(restored, "Arguments") === null })
    }
    function test_collapsedFailureAndScreenshots() {
        testDriver.replay("compact-tools")
        tryVerify(function() { return findText(panel, "Failed") !== null })
        compare(findText(panel, "Arguments"), null)
        compare(findText(panel, "Result"), null)
        wait(80)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/compact-tools-collapsed.png")
        const toggle = findVisible(panel, "toolDetails_cccccccccccccccccccccccccccccccc")
        verify(toggle !== null)
        mouseClick(toggle)
        tryVerify(function() { return findText(panel, "Code · javascript") !== null })
        wait(80)
        if (directory) grabImage(panel).save(directory + "/compact-tools-expanded.png")
    }
    function test_toolResultKeepsArguments() {
        testDriver.replay("tool-calls")
        tryVerify(function() { return findText(panel, "Read notes.txt") !== null })
        compare(findText(panel, "Arguments"), null)
        compare(findText(panel, "Result"), null)
        mouseClick(findText(panel, "Show details"))
        tryVerify(function() { return findText(panel, "Arguments") !== null })
        verify(findText(panel, "Result") !== null)
        verify(findText(panel, "Done") !== null)
    }
    function test_executionCodeAndCopy() {
        testDriver.replay("code-execution")
        tryVerify(function() { return findText(panel, "Show details") !== null })
        compare(findText(panel, "Code · javascript"), null)
        mouseClick(findText(panel, "Show details"))
        tryVerify(function() { return findText(panel, "Code · javascript") !== null })
        wait(80)
        const copy = findText(panel, "Copy code")
        verify(copy !== null)
        mouseClick(copy)
        compare(testDriver.clipboardText(), 'const scenes = ["Opening", "Finale"];\nconsole.log(scenes.length);')
        const resultCopy = findText(panel, "Copy result")
        verify(resultCopy !== null)
        mouseClick(resultCopy)
        verify(testDriver.clipboardText().indexOf('"stdout": "2\\n"') >= 0)
    }
    function test_composerMultilineAndDraftSwitch() {
        const input = findChild(panel, "chatInput")
        verify(input !== null)
        input.forceActiveFocus()
        typeLetters("first")
        keyClick(Qt.Key_Return)
        typeLetters("second")
        compare(testSession.draft, "first\nsecond")
        testSession.selectThread("b")
        tryCompare(input, "text", "")
        typeLetters("other")
        testSession.selectThread("a")
        tryCompare(input, "text", "first\nsecond")
    }
    function test_accessibleComposerAndSendState() {
        const input = findChild(panel, "chatInput")
        const send = findChild(panel, "sendMessage")
        verify(input !== null)
        verify(send !== null)
        verify(Qt.colorEqual(input.selectedTextColor, Ui.Theme.textOnAccent))
        compare(input.Accessible.name, "Message")
        compare(send.enabled, false)
        testSession.draft = "Make a film"
        tryCompare(send, "enabled", true)
    }
    function test_longMessageIsReadableInBoundedSections() {
        testDriver.longHistory("a")
        tryVerify(function() { return findVisible(panel, "message_long") !== null })
        const message = findVisible(panel, "message_long")
        verify(message !== null)
        verify(findText(message, "Section 1 of 3 · Plain text") !== null)
        const next = findText(message, "Next section")
        verify(next !== null)
        const view = findChild(panel, "chatMessages")
        view.positionViewAtEnd()
        wait(30)
        verify(next.visible)
        mouseClick(next)
        tryVerify(function() { return findText(message, "Section 2 of 3 · Plain text") !== null })
        compare(findText(message, "Copy full text"), null)
    }
    function test_historyLoadingIsSeparateFromTurnAndEmptyState() {
        loadingView.active = true
        wait(30)
        const label = findChild(loadingView.item, "chatHistoryLoadingLabel")
        const prompt = findChild(loadingView.item, "chatHistoryEmptyPrompt")
        verify(label !== null)
        compare(label.visible, true)
        compare(prompt.visible, false)
        compare(loadingSession.turnStatus, "idle")
        loadingSession.historyLoading = false
        tryCompare(label, "visible", false)
        tryCompare(prompt, "visible", true)
    }
    function test_incompleteMarkdownStreams() {
        const first = "**Starting `code"
        testDriver.stream("a", first)
        wait(50)
        compare(testSession.turnStatus, "streaming")
        const view = findChild(panel, "chatMessages")
        view.positionViewAtEnd()
        wait(30)
        const middle = "\n```cpp\nint x = 1;"
        testDriver.stream("a", middle)
        wait(50)
        view.positionViewAtEnd()
        wait(30)
        testDriver.stream("a", "\n```\n**done**", true)
        wait(30)
        compare(testSession.turnStatus, "idle")
    }
    function test_structuredPartsRenderThroughCppModel() {
        testDriver.approval("a")
        tryVerify(function() { return findText(panel, "test_write") !== null }, 5000)
        tryVerify(function() { return findText(panel, "Approve") !== null }, 5000)
        tryVerify(function() { return findText(panel, "Decline") !== null }, 5000)
    }
    function test_scrollAnchorSurvivesThreadSwitch() {
        testDriver.history("a", 100)
        wait(80)
        const view = findChild(panel, "chatMessages")
        verify(view !== null)
        view.positionViewAtIndex(30, ListView.Beginning)
        wait(30)
        view.movementEnded()
        const before = view.contentY
        const beforeIndex = view.indexAt(1, view.contentY + 1)
        verify(before > 0)
        testSession.selectThread("b")
        wait(30)
        testSession.selectThread("a")
        wait(80)
        verify(Math.abs(view.contentY - before) < 40, "Reader position should survive switching threads: y " + before + " -> " + view.contentY + ", row " + beforeIndex + " -> " + view.indexAt(1, view.contentY + 1))
    }
    function test_conversationAndComposerShareCenteredColumn() {
        test.width = 1600
        testDriver.history("a", 1)
        wait(80)
        const composer = findChild(panel, "chatComposer")
        const message = findVisible(panel, "message_0")
        verify(composer !== null)
        verify(message !== null)
        compare(composer.width, 800)
        compare(message.width, 800)
        compare(Math.round(composer.mapToItem(panel, 0, 0).x), Math.round(message.mapToItem(panel, 0, 0).x))
    }
    function test_themeAndScaleKeepDraftAndOpenPicker() {
        testSession.draft = "Keep this draft"
        const chooser = findChild(panel, "chooseChatModel")
        verify(chooser !== null)
        chooser.forceActiveFocus()
        keyClick(Qt.Key_Space)
        const popup = findChild(test.Window.window.contentItem, "sharedModelPicker")
        verify(popup !== null)
        tryCompare(popup, "visible", true)
        Ui.Theme.preference = Ui.Theme.Light
        Ui.Theme.uiScale = 1.25
        Ui.Theme.textScale = 1.5
        Ui.Theme.reducedMotion = true
        compare(testSession.draft, "Keep this draft")
        compare(popup.visible, true)
        Ui.Theme.preference = Ui.Theme.Dark
        compare(testSession.draft, "Keep this draft")
        compare(popup.visible, true)
        keyClick(Qt.Key_Escape)
        tryCompare(popup, "visible", false)
        Ui.Theme.preference = Ui.Theme.System
        Ui.Theme.uiScale = 1
        Ui.Theme.textScale = 1
        Ui.Theme.reducedMotion = false
    }
    function test_scaleAcrossBreakpointPreservesOpenPicker() {
        test.width = 700
        testSession.draft = "Draft at breakpoint"
        const chooser = findChild(panel, "chooseChatModel")
        verify(chooser !== null)
        chooser.forceActiveFocus()
        keyClick(Qt.Key_Space)
        const search = findChild(test.Window.window.contentItem, "modelPickerSearch")
        verify(search !== null)
        Ui.Theme.uiScale = 1.25
        wait(30)
        const currentSearch = findChild(test.Window.window.contentItem, "modelPickerSearch")
        verify(currentSearch === search && currentSearch.visible, "Scaling must preserve the open picker")
        compare(testSession.draft, "Draft at breakpoint")
        keyClick(Qt.Key_Escape)
        Ui.Theme.uiScale = 1
    }
    function test_modelPickerUsesServerDefaultAndRestoresFocus() {
        const chooser = findChild(panel, "chooseChatModel")
        verify(chooser !== null)
        testSession.provider = "test-provider"
        testSession.model = "test-model"
        compare(chooser.Accessible.expandable, true)
        compare(chooser.Accessible.expanded, false)
        compare(chooser.checkable, false)
        chooser.forceActiveFocus()
        keyClick(Qt.Key_Space)
        wait(30)
        compare(chooser.Accessible.expanded, true)
        const search = findChild(test.Window.window.contentItem, "modelPickerSearch")
        const defaultButton = findChild(test.Window.window.contentItem, "modelPickerServerDefault")
        verify(search !== null)
        verify(defaultButton !== null)
        tryCompare(search, "activeFocus", true)
        mouseClick(defaultButton)
        compare(testSession.provider, "")
        compare(testSession.model, "")
        tryCompare(chooser, "activeFocus", true)
        compare(chooser.Accessible.expanded, false)
    }
    function test_messagesHaveNoCopyButtons() {
        testDriver.codeHistory("a", "int value = 0;\n")
        tryVerify(function() { return findVisible(panel, "message_code") !== null })
        const message = findVisible(panel, "message_code")
        verify(message !== null)
        compare(findText(message, "Copy full text"), null)
        compare(findText(message, "Copy code 1"), null)
    }
    function test_narrowNavigationStartsInConversation() {
        test.width = 400
        wait(50)
        verify(findChild(panel, "chatInput") !== null)
        const chats = findText(panel, "Chats")
        verify(chats !== null)
        mouseClick(chats)
        wait(100)
        verify(findChild(panel, "chatThreads") !== null)
    }
}

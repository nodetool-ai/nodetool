import QtQuick
import QtQuick.Controls
import QtTest
import NodeTool.Chat

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
        compare(input.Accessible.name, "Message")
        compare(send.enabled, false)
        testSession.draft = "Make a film"
        tryCompare(send, "enabled", true)
    }
    function test_longMessageIsReadableInBoundedSections() {
        testDriver.longHistory("a")
        wait(80)
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
        verify(findText(message, "Copy full text") !== null)
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
    function test_incompleteMarkdownStreamsAndCopiesExactText() {
        const first = "**Starting `code"
        testDriver.stream("a", first)
        wait(50)
        compare(testSession.turnStatus, "streaming")
        const view = findChild(panel, "chatMessages")
        view.positionViewAtEnd()
        wait(30)
        const copy = findText(panel, "Copy full text")
        verify(copy !== null)
        testDriver.setClipboardText("before")
        mouseClick(copy)
        compare(testDriver.clipboardText(), first)
        const middle = "\n```cpp\nint x = 1;"
        testDriver.stream("a", middle)
        wait(50)
        view.positionViewAtEnd()
        wait(30)
        const codeCopy = findText(panel, "Copy code 1")
        verify(codeCopy !== null)
        mouseClick(codeCopy)
        compare(testDriver.clipboardText(), "int x = 1;")
        testDriver.stream("a", "\n```\n**done**", true)
        wait(30)
        compare(testSession.turnStatus, "idle")
    }
    function test_largeFencedCodeCopyKeepsCompleteSource() {
        const code = "int value = 0;\n".repeat(800)
        testDriver.codeHistory("a", code)
        wait(80)
        const view = findChild(panel, "chatMessages")
        view.positionViewAtEnd()
        wait(30)
        const codeCopy = findText(panel, "Copy code 1")
        const fullCopy = findText(panel, "Copy full text")
        verify(codeCopy !== null)
        verify(fullCopy !== null)
        testDriver.setClipboardText("before")
        mouseClick(codeCopy)
        compare(testDriver.clipboardText(), code)
        mouseClick(fullCopy)
        compare(testDriver.clipboardText(), "```cpp\n" + code + "```")
    }
    function test_structuredPartsRenderThroughCppModel() {
        testDriver.approval("a")
        wait(80)
        verify(findText(panel, "test_write") !== null)
        verify(findText(panel, "Approve") !== null)
        verify(findText(panel, "Decline") !== null)
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
    function test_narrowNavigationUsesThreadPage() {
        test.width = 400
        wait(50)
        verify(findChild(panel, "chatThreads") !== null)
        verify(findChild(panel, "chatInput") === null)
    }
}

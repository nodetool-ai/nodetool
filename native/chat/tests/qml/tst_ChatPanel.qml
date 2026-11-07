import QtQuick
import QtQuick.Window
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

    function overflow(item, boundary, failures) {
        if (!item.visible || item.opacity === 0) return
        const point = item.mapToItem(boundary, 0, 0)
        if (item.width > 0 && item.height > 0 && (point.x < -1 || point.x + item.width > boundary.width + 1))
            failures.push(item.objectName + ":" + item.toString() + " " + point.x + "+" + item.width)
        // Horizontal scrolling is an explicit escape at the dock's 100 px minimum.
        const childBoundary = item.objectName === "chatWidthViewport" ? item.contentItem : boundary
        for (let i = 0; i < item.children.length; ++i) overflow(item.children[i], childBoundary, failures)
    }

    Component { id: oversized; Rectangle { width: 900; height: 20 } }
    function test_overflowDetectorRejectsOversizedContent() {
        const item = createTemporaryObject(oversized, panel)
        verify(item !== null)
        const failures = []
        overflow(item, panel, failures)
        // The test panel is 1100 px wide, so deliberately cross its edge.
        item.width = panel.width + 50
        overflow(item, panel, failures)
        verify(failures.length > 0)
        expectFailContinue("", "Deliberately oversized content must fail the width assertion")
        compare(failures.join("\n"), "")
    }
    function test_codeAndStatusLabels() {
        const card = createTemporaryObject(actionCard, test, {
            width: 360, messageId: "labels", role: "assistant", text: "", status: "",
            parts: [{type: "tool_call", tool: true, expanded: true, code: "print(1)", displayStatus: "completed"}],
            session: actionSession
        })
        verify(card !== null)
        tryVerify(() => findText(card, "Code") !== null)
        compare(findText(card, "Code · "), null)
        verify(findText(card, "Done") !== null)
        for (const pair of [["running", "Running"], ["completed", "Done"], ["failed", "Failed"], ["waiting", "Waiting"]])
            compare(card.statusLabel(pair[0]), pair[1])
    }
    function test_hostWidth_data() {
        const rows = []
        for (const width of [100, 320, 360, 520])
            for (const fixture of ["tool-presentation", "execution-tree", "thinking", "markdown", "plans-approvals", "tool-approval", "secret-request", "media-resources", "sub-agents"])
                rows.push({tag: fixture + "-" + width, fixture: fixture, panelWidth: width})
        return rows
    }
    function test_hostWidth(data) {
        test.width = data.panelWidth
        Ui.Theme.preference = Ui.Theme.Dark
        if (data.fixture === "tool-approval") testDriver.replay("plans-approvals", 1, 1)
        else if (data.fixture === "secret-request") testDriver.replay("plans-approvals", 1, 2)
        else testDriver.replay(data.fixture, data.fixture === "plans-approvals" ? 1 : 100000)
        const list = findChild(panel, "chatMessages")
        tryVerify(() => list.count > 0)
        findChild(panel, "chatConversation").followBottom = false
        wait(150)
        list.positionViewAtBeginning()
        wait(150)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/host-" + data.tag + ".png")
        const viewport = findChild(panel, "chatWidthViewport")
        compare(viewport.contentWidth, Math.max(data.panelWidth, ChatMetrics.minimumContentWidth))
        const failures = []
        overflow(panel, panel, failures)
        compare(failures.join("\n"), "")
        if (["tool-presentation", "thinking", "tool-approval", "sub-agents"].indexOf(data.fixture) >= 0) {
            for (let i = 0; i < 12; ++i) {
                const button = findText(panel, "Show details")
                if (!button) break
                button.clicked()
                wait(30)
            }
            list.positionViewAtBeginning()
            wait(100)
            const expandedFailures = []
            overflow(panel, panel, expandedFailures)
            compare(expandedFailures.join("\n"), "")
            if (directory) grabImage(panel).save(directory + "/host-" + data.tag + "-expanded.png")
        }
        if (data.panelWidth === 100) {
            viewport.contentX = viewport.contentWidth - viewport.width
            wait(30)
            compare(viewport.contentX, viewport.contentWidth - viewport.width)
            viewport.contentX = 0
        }
    }
    function test_mediaResources() {
        testDriver.replay("media-resources")
        tryVerify(() => findText(panel, "Production notes") !== null)
        verify(findText(panel, "timeline · Evening cut") !== null)
        verify(findText(panel, "Exterior at dusk. Hold the final frame for two seconds.") !== null)
        verify(findText(panel, "Open resource") === null)
        const directory = testDriver.screenshotDirectory()
        const list = findChild(panel, "chatMessages")
        list.positionViewAtEnd()
        wait(100)
        if (directory) grabImage(panel).save(directory + "/media-resources.png")
    }
    function test_mediaHeavyHistory() {
        testDriver.mediaHistory(2000)
        const list = findChild(panel, "chatMessages")
        tryCompare(list, "count", 2000)
        list.positionViewAtBeginning()
        wait(100)
        verify(list.contentItem.children.length < 100)
        tryVerify(() => findText(panel, "Open large image") !== null)
    }
    function test_mediaImageDialog() {
        testDriver.mediaHistory(1)
        tryVerify(() => findText(panel, "Open large image") !== null)
        const list = findChild(panel, "chatMessages")
        list.positionViewAtBeginning()
        wait(150)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/media-group.png")
        mouseClick(findText(panel, "Open large image"))
        tryVerify(() => findText(Overlay.overlay, "Close image") !== null)
        wait(150)
        if (directory) grabImage(panel.Window.window.contentItem).save(directory + "/media-large.png")
        keyClick(Qt.Key_Escape)
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
    function findTextStarting(item, prefix) {
        if (!item.visible) return null
        if (item.linkColour !== undefined && typeof item.text === "string" && item.text.startsWith(prefix)) return item
        for (let i = 0; i < item.children.length; ++i) {
            const found = findTextStarting(item.children[i], prefix)
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
    QtObject {
        id: actionSession
        property string connectionStatus: "connected"
        property var responses: []
        function markdownPages(text) { return testSession.markdownPages(text) }
        function styleMarkdownLinks(document, colour) { testSession.styleMarkdownLinks(document, colour) }
        function respondToAction(id, allow, feedback) { responses = responses.concat([{id: id, allow: allow, feedback: feedback}]) }
        function openProviderSettings() { responses = responses.concat([{settings: true}]) }
    }
    Component { id: actionCard; MessageDelegate {} }
    function test_approvalButtonsUseServerId() {
        testDriver.replay("plans-approvals", 1)
        actionSession.responses = []
        const card = createTemporaryObject(actionCard, test, {
            width: 700, messageId: "test", role: "assistant", text: "", status: "",
            parts: testDriver.currentParts(), session: actionSession
        })
        verify(card !== null)
        mouseClick(findText(card, "Run this plan"))
        compare(actionSession.responses[0].id, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        compare(actionSession.responses[0].allow, true)
        verify(actionSession.responses[0].feedback === undefined)
        const field = findChild(card, "planFeedback")
        verify(field !== null)
        field.forceActiveFocus()
        typeLetters("revise")
        tryVerify(() => findText(card, "Revise").enabled)
        mouseClick(findText(card, "Revise"))
        compare(actionSession.responses[1].allow, false)
        compare(actionSession.responses[1].feedback, "revise")
        mouseClick(findText(card, "Don’t run"))
        verify(actionSession.responses[2].feedback === undefined)
    }
    function test_secretSettingsAndDecline() {
        testDriver.replay("plans-approvals", 1, 2)
        actionSession.responses = []
        const card = createTemporaryObject(actionCard, test, {
            width: 700, messageId: "test", role: "assistant", text: "", status: "",
            parts: testDriver.currentParts(), session: actionSession
        })
        verify(card !== null)
        verify(findText(card, "Allow") === null)
        verify(findText(card, "Run this plan") === null)
        mouseClick(findText(card, "Open settings"))
        verify(actionSession.responses[0].settings)
        mouseClick(findText(card, "Decline"))
        compare(actionSession.responses[1].id, "cccccccccccccccccccccccccccccccc")
        compare(actionSession.responses[1].allow, false)
        verify(actionSession.responses[1].feedback === undefined)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(card).save(directory + "/secret-request.png")
    }
    function test_planPreviewAndApprovalDetails() {
        testDriver.replay("plans-approvals", 1)
        tryVerify(() => findText(panel, "Run this plan") !== null)
        verify(findText(panel, "Revise") !== null)
        verify(!findText(panel, "Revise").enabled)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/plan-approval.png")
        testSession.disconnectFromServer()
        wait(30)
        testDriver.resetSession()
        testDriver.replay("plans-approvals", 1, 1)
        tryVerify(() => findText(panel, "Show details") !== null)
        verify(findText(panel, "Arguments") === null)
        mouseClick(findText(panel, "Show details"))
        tryVerify(() => findText(panel, "Arguments") !== null)
        if (directory) grabImage(panel).save(directory + "/tool-approval.png")
    }
    function test_compactionCard() {
        testDriver.replay("compaction")
        tryVerify(() => findText(panel, "Earlier conversation summarized") !== null)
        verify(findText(panel, "Hide details") === null)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/compaction-collapsed.png")
        const button = findText(panel, "Show details")
        button.forceActiveFocus()
        keyClick(Qt.Key_Space)
        tryVerify(() => findText(panel, "Hide details") !== null)
        if (directory) grabImage(panel).save(directory + "/compaction-expanded.png")
    }
    function test_subAgentTranscript() {
        testDriver.replay("sub-agents")
        tryVerify(() => findText(panel, "Audit the config loader") !== null)
        verify(findText(panel, "2 messages") !== null)
        verify(findText(panel, "Checked three files.") === null)
        const button = findVisible(panel, "toolDetails_call-1")
        verify(button !== null)
        mouseClick(button)
        tryVerify(() => findText(panel, "Checked three files.") !== null)
        verify(findText(panel, "Read every config file and report unused keys.") !== null)
        tryVerify(() => findText(panel, "Searched todo") !== null)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/sub-agents.png")
    }
    function test_longExecutionExpansionSurvivesScroll() {
        testDriver.longExecution()
        tryVerify(() => findVisible(panel, "nested_execution:long-run") !== null)
        const list = findVisible(panel, "nested_execution:long-run")
        tryCompare(list, "count", 2000)
        list.positionViewAtBeginning()
        tryVerify(() => findVisible(list, "message_log:0") !== null)
        mouseClick(findText(findVisible(list, "message_log:0"), "Show details"))
        tryVerify(() => findText(list, "Section 1 of 2") !== null)
        list.positionViewAtEnd()
        wait(100)
        verify(list.contentItem.children.length < 80)
        list.positionViewAtBeginning()
        tryVerify(() => findText(list, "Section 1 of 2") !== null)
    }
    function test_executionTreeShrinksWithHost() {
        testDriver.replay("execution-tree")
        tryVerify(() => findVisible(panel, "nested_audit") !== null)
        const execution = findVisible(panel, "nested_execution:0123456789abcdef0123456789abcdef")
        const task = findVisible(panel, "nested_audit")
        tryCompare(execution, "width", ChatMetrics.columnWidth - Ui.Metrics.md * 2)
        tryCompare(task, "width", execution.width - Ui.Metrics.md * 2)
        for (const width of [100, 520, 360, 320, 1100, 100]) {
            test.width = width
            const viewport = findChild(panel, "chatWidthViewport")
            tryCompare(viewport, "contentWidth", Math.max(width, ChatMetrics.minimumContentWidth))
            tryCompare(execution, "width", Math.min(viewport.contentWidth - Ui.Metrics.xl * 2, ChatMetrics.columnWidth) - Ui.Metrics.md * 2)
            tryCompare(task, "width", execution.width - Ui.Metrics.md * 2)
            compare(execution.highlightItem.width, execution.width)
            compare(task.highlightItem.width, task.width)
        }
        const failures = []
        overflow(panel, panel, failures)
        compare(failures.join("\n"), "")
    }
    function test_executionTree() {
        testDriver.replay("execution-tree")
        tryVerify(() => findText(panel, "Agent execution") !== null)
        tryVerify(() => findText(panel, "Audit configuration") !== null)
        tryVerify(() => findText(panel, "Read config files") !== null)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/execution-tree.png")
    }
    function init() {
        loadingView.active = false
        loadingSession.historyLoading = true
        test.width = 1100
        testSession.selectThread("a")
        testSession.draft = ""
        const conversation = findChild(panel, "chatConversation")
        conversation.scrollPositions = ({})
        conversation.previousThread = ""
        conversation.followBottom = true
        conversation.anchorIndex = 0
        conversation.anchorOffset = 0
        testSession.disconnectFromServer()
        wait(30)
        testDriver.resetSession()
        wait(30)
    }
    function test_linkColours() {
        testDriver.replay("link-colours")
        // Pages split by layout, which differs between platforms, so match the Markdown page by its start.
        const source = "## Markdown colours\n\n[NodeTool](https://nodetool.ai) with"
        tryVerify(() => findTextStarting(panel, source) !== null)
        const area = findTextStarting(panel, source)
        const original = Ui.Theme.preference
        try {
            for (const scheme of [Ui.Theme.Dark, Ui.Theme.Light]) {
                Ui.Theme.preference = scheme
                compare(area.color, Ui.Theme.textPrimary)
                function luminance(colour) {
                    function linear(value) { return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4) }
                    return 0.2126 * linear(colour.r) + 0.7152 * linear(colour.g) + 0.0722 * linear(colour.b)
                }
                const foreground = luminance(area.linkColour)
                const background = luminance(Ui.Theme.surfacePanel)
                verify((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) >= 4.5)
                wait(100)
                const pixels = grabImage(panel)
                let linkPixels = 0
                for (let y = 0; y < pixels.height; ++y) {
                    for (let x = 0; x < pixels.width; ++x) {
                        if (Math.abs(pixels.red(x, y) / 255 - area.linkColour.r) + Math.abs(pixels.green(x, y) / 255 - area.linkColour.g) + Math.abs(pixels.blue(x, y) / 255 - area.linkColour.b) < 0.03) linkPixels++
                    }
                }

                const directory = testDriver.screenshotDirectory()
                if (directory) grabImage(panel).save(directory + (scheme === Ui.Theme.Dark ? "/link-colours-dark.png" : "/link-colours-light.png"))
                verify(linkPixels > 10, "Rendered link must use the theme colour: " + scheme + ", " + pixels.width + "x" + pixels.height + ", pixels=" + linkPixels)
            }
        } finally {
            Ui.Theme.preference = original
        }
    }
    function test_markdownAndScreenshot() {
        testDriver.replay("markdown")
        tryVerify(function() { return findText(panel, "cpp") !== null })
        mouseClick(findText(panel, "Copy code"))
        compare(testDriver.clipboardText(), "int answer = 42;\n")
        const list = findChild(panel, "chatMessages")
        list.positionViewAtBeginning()
        wait(100)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/markdown.png")
        list.positionViewAtEnd()
        wait(100)
        if (directory) grabImage(panel).save(directory + "/markdown-mixed.png")
    }
    function test_zz_linkSchemes() {
        testSession.openExternal("https://nodetool.ai")
        compare(testDriver.openedLink(), "https://nodetool.ai")
        testSession.openExternal("file:///etc/passwd")
        compare(testDriver.openedLink(), "https://nodetool.ai")
        verify(testSession.error.indexOf("not supported") >= 0)
    }
    property int streamTicks: 0
    property double lastTick: 0
    property double longestTick: 0
    Timer {
        id: streamTimer
        interval: 10
        repeat: true
        onTriggered: {
            const now = Date.now()
            if (test.lastTick) test.longestTick = Math.max(test.longestTick, now - test.lastTick)
            test.lastTick = now
            testDriver.stream("a", "A long streamed paragraph with **Markdown**.\n\n".repeat(45))
            test.streamTicks++
            if (test.streamTicks === 60) {
                stop()
                testDriver.stream("a", "Done", true)
            }
        }
    }
    function test_longDocumentRemainsInteractive() {
        streamTicks = 0
        lastTick = 0
        longestTick = 0
        streamTimer.start()
        testSession.draft = "Keep this draft while streaming"
        tryCompare(test, "streamTicks", 60, 10000)
        compare(testSession.draft, "Keep this draft while streaming")
        verify(longestTick < 500, "Longest GUI timer interval: " + longestTick + "ms")
        compare(testSession.turnStatus, "idle")
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/markdown-long-stream.png")
    }
    function test_thinkingAndScreenshot() {
        testDriver.replay("thinking", 1)
        tryVerify(function() { return findText(panel, "Thinking") !== null })
        const toggle = findVisible(panel, "toolDetails_0")
        verify(toggle.Accessible.expanded)
        mouseClick(toggle)
        compare(toggle.Accessible.expanded, false)
        testDriver.stream("a", "Answer", true)
        tryVerify(function() { return findText(panel, "Thought for 1s") !== null })
        compare(toggle.Accessible.expanded, false)
        mouseClick(toggle)
        wait(80)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/thinking.png")
    }
    function test_thoughtExpansionSurvivesScrolling() {
        findChild(panel, "chatConversation").followBottom = false
        testDriver.thoughtHistory(2000)
        const list = findChild(panel, "chatMessages")
        tryCompare(list, "count", 2000)
        list.positionViewAtBeginning()
        wait(100)
        let first = findVisible(panel, "message_0")
        verify(first !== null)
        mouseClick(findVisible(first, "toolDetails_0"))
        list.positionViewAtEnd()
        wait(100)
        list.positionViewAtBeginning()
        wait(100)
        first = findVisible(panel, "message_0")
        verify(findVisible(first, "toolDetails_0").Accessible.expanded)
    }
    function test_persistedToolsAndScreenshot() {
        testDriver.persistedTools()
        const list = findChild(panel, "chatMessages")
        tryCompare(list, "count", 2)
        tryVerify(function() { return findText(panel, "Failed") !== null })
        verify(findText(panel, "Ran 2 searches") !== null)
        verify(findText(panel, "1.2s") !== null)
        const code = findVisible(panel, "toolDetails_00000000000000000000000000000003")
        verify(code !== null)
        wait(80)
        mouseClick(code)
        tryVerify(function() { return findText(panel, "Code · javascript") !== null })
        wait(80)
        const message = findVisible(panel, "message_00000000000000000000000000000067")
        verify(message !== null)
        const conversation = findChild(panel, "chatConversation")
        conversation.followBottom = false
        function copySection(name, label) {
            const section = findVisible(message, name)
            verify(section !== null)
            const button = findChild(section, "copyTextButton")
            verify(button !== null)
            compare(button.text, label)
            compare(button.Accessible.name, label)
            list.forceLayout()
            // visible does not imply that a ListView descendant is inside its viewport.
            const point = button.mapToItem(list, 0, 0)
            list.contentY = Math.max(list.originY, Math.min(list.originY + list.contentHeight - list.height,
                list.contentY + point.y - (list.height - button.height) / 2))
            verify(waitForRendering(button))
            const position = button.mapToItem(list, 0, 0)
            verify(position.y >= 0 && position.y + button.height <= list.height)
            mouseClick(button, button.width / 2, button.height / 2, Qt.LeftButton, Qt.NoModifier, 0)
        }
        copySection("toolCode_00000000000000000000000000000003", "Copy code")
        compare(testDriver.clipboardText(), "console.log(2);")
        copySection("toolResult_00000000000000000000000000000003", "Copy result")
        compare(testDriver.clipboardText(), JSON.stringify({stdout: "2\n"}, null, 4) + "\n")
        wait(80)
        const directory = testDriver.screenshotDirectory()
        if (directory) grabImage(panel).save(directory + "/persisted-tools.png")
    }
    function test_groupFormationKeepsScroll() {
        testDriver.history("a", 100)
        testDriver.replay("tool-presentation", 1)
        const list = findChild(panel, "chatMessages")
        const conversation = findChild(panel, "chatConversation")
        conversation.followBottom = false
        list.positionViewAtIndex(40, ListView.Beginning)
        wait(80)
        conversation.captureAnchor()
        const before = list.contentY
        testDriver.replay("tool-presentation")
        wait(80)
        compare(list.count, 101)
        verify(Math.abs(list.contentY - before) < 1)
    }
    function test_groupedCallsAndScreenshot() {
        testDriver.replay("tool-presentation")
        const list = findChild(panel, "chatMessages")
        tryCompare(list, "count", 1)
        tryVerify(function() { return findText(panel, "Ran 3 searches") !== null })
        mouseClick(findText(panel, "Show details"))
        const toggle = findVisible(panel, "groupCall_00000000000000000000000000000002")
        verify(toggle !== null)
        wait(80)
        mouseClick(toggle)
        tryVerify(function() { return findText(panel, '{\n    "query": "tiktok creative"\n}\n') !== null })
        const directory = testDriver.screenshotDirectory()
        wait(80)
        if (directory) grabImage(panel).save(directory + "/tool-presentation.png")
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
        findChild(panel, "chatConversation").followBottom = false
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
        wait(80)
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
        verify(findText(message, "Section 1 of 3") !== null)
        const next = findText(message, "Next section")
        verify(next !== null)
        const view = findChild(panel, "chatMessages")
        view.positionViewAtEnd()
        wait(30)
        verify(next.visible)
        mouseClick(next)
        tryVerify(function() { return findText(message, "Section 2 of 3") !== null })
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
        tryVerify(function() { return findText(panel, "Allow this action?") !== null }, 5000)
        tryVerify(function() { return findText(panel, "Allow") !== null }, 5000)
        tryVerify(function() { return findText(panel, "Deny") !== null }, 5000)
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

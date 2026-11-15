pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property var session
    property bool showBack: false
    property bool embedded: false
    readonly property real composerHeight: composer.height + Ui.Metrics.md
    signal backRequested
    property var scrollPositions: ({})
    property string previousThread: ""
    property bool followBottom: true
    property int anchorIndex: 0
    property real anchorOffset: 0
    // A reply is on its way: ChatThreadView.tsx shows a quiet pulse at the
    // end of the conversation in place of a status word.
    readonly property bool responding: !!session && (session.turnStatus === "loading" || session.turnStatus === "streaming")
    // Claude's new chat: the greeting and the composer as one block in the
    // middle of the panel (ChatView.tsx centerEmptyState).
    readonly property bool emptyCentered: !embedded && !!session && !!session.selectedThreadId
        && !session.historyLoading && messages.count === 0
    // WelcomePlaceholder.tsx greeting: the time of day, refreshed when the
    // conversation opens.
    property int greetingHour: new Date().getHours()
    function greeting(hour) {
        if (hour >= 5 && hour < 12) { return qsTr("Good morning"); }
        if (hour >= 12 && hour < 18) { return qsTr("Good afternoon"); }
        return qsTr("Good evening");
    }
    onEmptyCenteredChanged: if (emptyCentered) greetingHour = new Date().getHours()
    readonly property bool titleMenuShown: !embedded && !!session && !!session.selectedThreadId && !emptyCentered
    readonly property string threadLabel: session && session.threadTitle ? session.threadTitle : qsTr("Untitled chat")
    property bool renamingTitle: false
    function startTitleRename() {
        renamingTitle = true
        titleRenameField.text = threadLabel
        titleRenameField.forceActiveFocus()
        titleRenameField.selectAll()
    }
    function finishTitleRename() {
        if (!renamingTitle) return
        renamingTitle = false
        session.renameThread(session.selectedThreadId, titleRenameField.text)
    }
    objectName: "chatConversation"
    function savePosition() {
        if (session && session.selectedThreadId === previousThread) {
            captureAnchor();
        }
        if (previousThread) {
            scrollPositions[previousThread] = {
                y: messages.contentY,
                bottom: followBottom,
                index: anchorIndex,
                offset: anchorOffset
            };
        }
    }
    function captureAnchor() {
        let index = -1;
        for (let offset = 1; offset <= messages.spacing + 2 && index < 0; ++offset) {
            index = messages.indexAt(1, messages.contentY + offset);
        }
        const item = messages.itemAtIndex(index);
        if (item) {
            anchorIndex = index;
            anchorOffset = messages.contentY - item.y;
        }
    }
    function restoreAnchor() {
        messages.forceLayout();
        messages.positionViewAtIndex(anchorIndex, ListView.Beginning);
        messages.contentY += anchorOffset;
    }
    function followLatest() {
        if (followBottom) {
            messages.positionViewAtEnd();
        }
    }
    // useChatScrollAnchor.ts: a just-sent prompt is held near the top of the
    // view while the reply grows into empty space reserved below it, as on
    // claude.ai. The reserved tail is the footer's extra height.
    property bool anchoringTurn: false
    property real tailHeight: 0
    property bool anchorSawReply: false
    readonly property real contentEnd: messages.originY + messages.contentHeight - tailHeight
    function releaseTurnAnchor() {
        anchoringTurn = false;
        anchorSawReply = false;
        tailHeight = 0;
    }
    function anchorNewTurn(index) {
        messages.forceLayout();
        let item = messages.itemAtIndex(index);
        if (!item) {
            // A row just below the view may not have a delegate yet.
            messages.positionViewAtIndex(index, ListView.End);
            messages.forceLayout();
            item = messages.itemAtIndex(index);
        }
        if (!item || item.role !== "user") {
            return;
        }
        followBottom = false;
        anchoringTurn = true;
        anchorSawReply = false;
        tailHeight = messages.height;
        Qt.callLater(function () {
            messages.forceLayout();
            messages.positionViewAtIndex(index, ListView.Beginning);
            messages.contentY = Math.max(messages.originY, messages.contentY - Ui.Metrics.xl);
        });
    }
    // Once the reply outgrows the space under the prompt, keep its end in view.
    function keepTurnInView() {
        const overflow = contentEnd - (messages.contentY + messages.height);
        if (overflow > 1) {
            messages.contentY += overflow;
        }
    }
    onRespondingChanged: {
        if (responding) {
            anchorSawReply = anchoringTurn;
            return;
        }
        if (!anchoringTurn || !anchorSawReply) {
            return;
        }
        // The turn settled: keep the prompt where it is and trim the reserved
        // space to what holds this position.
        anchorSawReply = false;
        tailHeight = Math.max(0, messages.contentY + messages.height - (messages.originY + messages.contentHeight - tailHeight));
    }
    function restorePosition() {
        renamingTitle = false;
        releaseTurnAnchor();
        const saved = scrollPositions[session.selectedThreadId];
        followBottom = saved ? saved.bottom : true;
        anchorIndex = saved && saved.index !== undefined ? saved.index : 0;
        anchorOffset = saved && saved.offset !== undefined ? saved.offset : 0;
        Qt.callLater(function () {
            if (root.followBottom) {
                messages.positionViewAtEnd();
            }
            else {
                root.restoreAnchor();
            }
        });
        previousThread = session.selectedThreadId;
    }
    Ui.Surface {
        anchors.fill: parent
        variant: Ui.Surface.Canvas
        visible: !root.embedded
    }
    RowLayout {
        id: conversationHeader
        visible: !root.embedded
        height: root.embedded ? 0 : implicitHeight
        anchors.left: parent.left
        anchors.right: parent.right
        Ui.EditorButton {
            objectName: "chatThreadsButton"
            visible: root.showBack
            Layout.leftMargin: Ui.Metrics.md
            text: qsTr("Chats")
            iconName: "forum"
            onClicked: root.backRequested()
        }
        Ui.Text {
            objectName: "chatConversationTitle"
            role: Ui.Typography.SansBody
            Layout.fillWidth: true
            text: qsTr("Chat")
            visible: !root.showBack && !root.titleMenuShown
            Layout.leftMargin: Ui.Metrics.lg
        }
        // ChatTitleMenu.tsx: the thread's title with rename and delete, as
        // claude.ai shows it above a conversation.
        Ui.MenuButton {
            id: titleButton
            objectName: "chatTitleMenu"
            visible: !root.showBack && root.titleMenuShown && !root.renamingTitle
            Layout.leftMargin: Ui.Metrics.lg
            Layout.maximumWidth: root.width / 2
            text: root.threadLabel
            accessibleName: qsTr("Conversation options for %1").arg(root.threadLabel)
            variant: Ui.EditorButton.Flat
            contentAlignment: Qt.AlignLeft
            trailingIconName: "expandMore"
            menu: titleMenu
            Ui.ContextMenu {
                id: titleMenu
                Ui.MenuItem {
                    objectName: "chatTitleRenameItem"
                    text: qsTr("Rename")
                    iconName: "rename"
                    onTriggered: root.startTitleRename()
                }
                Ui.MenuItem {
                    objectName: "chatTitleDeleteItem"
                    text: qsTr("Delete")
                    iconName: "deleteOutline"
                    onTriggered: titleDeleteDialog.openFor(root.session.selectedThreadId, root.threadLabel)
                }
            }
        }
        Ui.TextField {
            id: titleRenameField
            objectName: "chatTitleRename"
            visible: !root.showBack && root.renamingTitle
            Layout.leftMargin: Ui.Metrics.lg
            Layout.preferredWidth: root.width / 2
            accessibleName: qsTr("Conversation name")
            onAccepted: root.finishTitleRename()
            onActiveFocusChanged: if (!activeFocus) root.finishTitleRename()
            Keys.onEscapePressed: root.renamingTitle = false
        }
        Item { Layout.fillWidth: true; visible: !root.showBack && root.titleMenuShown }
        Item { Layout.fillWidth: true; visible: root.showBack }
        Ui.ToolbarIconButton {
            visible: root.showBack
            variant: Ui.EditorButton.Flat
            iconName: "add"
            text: qsTr("New chat")
            enabled: !!root.session && root.session.connectionStatus === "connected"
            onClicked: root.session.createThread()
        }
        Ui.Text {
            role: Ui.Typography.SansLabel
            text: root.session && root.session.turnStatus !== "idle" && !root.responding ? root.session.turnStatus : ""
            tone: Ui.Text.Secondary
            Layout.rightMargin: Ui.Metrics.lg
        }
    }
    ColumnLayout {
        anchors.top: conversationHeader.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: root.embedded ? Ui.Metrics.sm : Ui.Metrics.xl
        spacing: Ui.Metrics.md
        // The two spacers hold the block a little above centre.
        Item {
            Layout.fillHeight: true
            Layout.verticalStretchFactor: 2
            visible: root.emptyCentered
        }
        Ui.EditorButton {
            text: qsTr("Load earlier messages")
            visible: !!root.session && root.session.hasMoreHistory
            enabled: root.session && root.session.connectionStatus === "connected"
            onClicked: {
                root.followBottom = false;
                root.session.loadMore();
            }
        }
        ListView {
            id: messages
            objectName: "chatMessages"
            Layout.fillWidth: true
            Layout.fillHeight: !root.emptyCentered
            Layout.preferredHeight: root.emptyCentered ? emptyState.implicitHeight : -1
            clip: true
            spacing: Ui.Metrics.md
            reuseItems: true
            model: root.session ? root.session.messages : null
            ScrollBar.vertical: Ui.ScrollBar {}
            onMovementStarted: if (root.anchoringTurn) root.releaseTurnAnchor()
            onMovementEnded: {
                root.followBottom = atYEnd;
                root.captureAnchor();
            }
            onContentHeightChanged: {
                if (root.anchoringTurn) {
                    Qt.callLater(root.keepTurnInView);
                }
                else if (root.followBottom) {
                    Qt.callLater(root.followLatest);
                }
            }
            onWidthChanged: {
                if (root.followBottom) {
                    Qt.callLater(root.followLatest);
                }
                else {
                    Qt.callLater(root.restoreAnchor);
                }
            }
            footer: Item {
                width: messages.width
                objectName: "chatMessagesFooter"
                height: (root.responding ? Ui.Metrics.xxl : 0) + root.tailHeight
                visible: root.responding || root.tailHeight > 0
                Ui.StatusDot {
                    id: respondingPulse
                    objectName: "chatRespondingPulse"
                    visible: root.responding
                    y: (Ui.Metrics.xxl - height) / 2
                    x: (parent.width - Math.min(parent.width, ChatMetrics.columnWidth)) / 2 + Ui.Metrics.xl
                    active: true
                    Accessible.role: Accessible.StatusBar
                    Accessible.name: qsTr("Responding…")
                    SequentialAnimation on opacity {
                        running: root.responding && !Ui.Theme.reducedMotion
                        loops: Animation.Infinite
                        onRunningChanged: if (!running) respondingPulse.opacity = 1
                        NumberAnimation { to: 0.35; duration: Ui.Metrics.motionSpin; easing.type: Easing.InOutQuad }
                        NumberAnimation { to: 1; duration: Ui.Metrics.motionSpin; easing.type: Easing.InOutQuad }
                    }
                }
            }
            // ScrollToBottomButton.tsx: a round arrow floating over the end of
            // the conversation while the reader is scrolled up. It sits over
            // the messages so showing it never moves the composer.
            Ui.EditorButton {
                objectName: "chatScrollToLatest"
                parent: messages
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom
                anchors.bottomMargin: Ui.Metrics.md
                visible: !root.followBottom && !root.anchoringTurn && !messages.atYEnd
                display: AbstractButton.IconOnly
                circular: true
                variant: Ui.EditorButton.Outlined
                iconName: "arrowDownward"
                text: qsTr("Latest messages")
                onClicked: {
                    root.releaseTurnAnchor();
                    root.followBottom = true;
                    messages.positionViewAtEnd();
                }
            }
            delegate: Item {
                required property string messageId
                required property string role
                required property string displayText
                required property var parts
                required property string status
                required property int index
                width: messages.width
                height: turn.implicitHeight
                MessageDelegate {
                    id: turn
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Math.min(parent.width, ChatMetrics.columnWidth)
                    messageId: parent.messageId
                    role: parent.role
                    text: parent.displayText
                    parts: parent.parts
                    status: parent.status
                    latest: parent.index === messages.count - 1
                    session: root.session
                }
            }
            ColumnLayout {
                anchors.centerIn: parent
                visible: !!root.session && root.session.historyLoading
                spacing: Ui.Metrics.md
                Ui.BusyIndicator {
                    objectName: "chatHistoryLoadingIndicator"
                    Layout.alignment: Qt.AlignHCenter
                    running: parent.visible
                    accessibleName: qsTr("Loading conversation")
                }
                Ui.Text {
                    role: Ui.Typography.SansLabel
                    objectName: "chatHistoryLoadingLabel"
                    text: qsTr("Loading conversation…")
                    tone: Ui.Text.Secondary
                }
            }
            ColumnLayout {
                id: emptyState
                anchors.centerIn: parent
                width: parent.width - Ui.Metrics.xl * 2
                visible: messages.count === 0 && !(root.session && root.session.historyLoading)
                spacing: root.embedded ? Ui.Metrics.xs : Ui.Metrics.xl
                Ui.Icon {
                    visible: root.embedded || root.emptyCentered
                    name: root.embedded ? "forum" : "autoAwesome"
                    size: ChatMetrics.emptyIcon
                    Layout.preferredWidth: ChatMetrics.emptyIcon
                    Layout.preferredHeight: ChatMetrics.emptyIcon
                    opacity: root.embedded ? 0.4 : 1
                    Layout.alignment: Qt.AlignHCenter
                }
                Ui.Text {
                    role: root.embedded ? Ui.Typography.SansLabel : Ui.Typography.SansTitle
                    objectName: "chatHistoryEmptyPrompt"
                    Layout.fillWidth: true
                    text: root.embedded ? qsTr("Start a conversation") : root.greeting(root.greetingHour)
                    wrapMode: Text.WordWrap
                    horizontalAlignment: Text.AlignHCenter
                }
                Ui.Text {
                    role: Ui.Typography.SansLabel
                    Layout.fillWidth: true
                    visible: !root.emptyCentered
                    text: root.embedded ? qsTr("Ask about this workflow, or type @ to reference an asset.") : qsTr("Start a new chat to work with an agent.")
                    wrapMode: Text.WordWrap
                    horizontalAlignment: Text.AlignHCenter
                    tone: Ui.Text.Secondary
                }
                Ui.EditorButton {
                    Layout.alignment: Qt.AlignHCenter
                    visible: !root.embedded && (!root.session || !root.session.selectedThreadId)
                    text: qsTr("New chat")
                    enabled: !!root.session && root.session.connectionStatus === "connected"
                    onClicked: root.session.createThread()
                }
            }
        }
        Ui.EditorButton {
            objectName: "retryEditorChat"
            text: qsTr("Retry")
            visible: !!root.session && root.session.turnStatus === "error"
            onClicked: root.session.retry()
        }
        ChatComposer {
            id: composer
            Layout.fillWidth: true
            Layout.maximumWidth: ChatMetrics.columnWidth
            Layout.alignment: Qt.AlignHCenter
            visible: !!root.session && !!root.session.selectedThreadId
            session: root.session
        }
        Item {
            Layout.fillHeight: true
            Layout.verticalStretchFactor: 3
            visible: root.emptyCentered
        }
    }
    Connections {
        target: root.session
        // Test doubles for the session may not declare promptSent.
        ignoreUnknownSignals: true
        function onStateChanged() {
            if (root.session.selectedThreadId !== root.previousThread) {
                root.savePosition();
                root.restorePosition();
            }
        }
        // Only a prompt sent from here is anchored: history loads and replays
        // keep their scroll position.
        function onPromptSent(threadId) {
            if (threadId === root.session.selectedThreadId) {
                Qt.callLater(root.anchorNewTurn, root.session.messages.rowCount() - 1);
            }
        }
    }
    Connections {
        target: root.session ? root.session.messages : null
        property real oldHeight: 0
        property real oldY: 0
        property bool prepending: false
        function onRowsAboutToBeInserted(parent, first, last) {
            prepending = first === 0 && messages.count > 0 && !root.followBottom;
            oldHeight = messages.contentHeight;
            oldY = messages.contentY;
        }
        function onRowsInserted(parent, first, last) {
            if (prepending) {
                root.anchorIndex += last - first + 1;
                Qt.callLater(function () {
                    messages.contentY = oldY + messages.contentHeight - oldHeight;
                });
            }
        }
    }
    Component.onCompleted: {
        if (session) {
            restorePosition();
        }
    }
    Component.onDestruction: savePosition()
    DeleteThreadDialog {
        id: titleDeleteDialog
        objectName: "chatTitleDeleteDialog"
        session: root.session
    }
}

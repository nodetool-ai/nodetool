pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Page {
    id: root
    required property var session
    property bool showBack: false
    signal backRequested
    property var scrollPositions: ({})
    property string previousThread: ""
    property bool followBottom: true
    property int anchorIndex: 0
    property real anchorOffset: 0
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
    function restorePosition() {
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
    background: Rectangle {
        color: ChatTheme.background
    }
    header: RowLayout {
        ChatButton {
            visible: root.showBack
            text: qsTr("Chats")
            flat: true
            onClicked: root.backRequested()
        }
        Label {
            Layout.fillWidth: true
            text: qsTr("Chat")
            visible: !root.showBack
            leftPadding: ChatTheme.lg
            color: ChatTheme.text
            font.pixelSize: ChatTheme.body
        }
        Item { Layout.fillWidth: true; visible: root.showBack }
        ChatButton {
            visible: root.showBack
            flat: true
            glyph: "+"
            text: qsTr("New chat")
            enabled: !!root.session && root.session.connectionStatus === "connected"
            onClicked: root.session.createThread()
        }
        Label {
            text: root.session && root.session.turnStatus !== "idle" ? root.session.turnStatus : ""
            color: ChatTheme.muted
            rightPadding: ChatTheme.lg
        }
    }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: ChatTheme.xl
        spacing: ChatTheme.md
        ChatButton {
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
            Layout.fillHeight: true
            clip: true
            spacing: ChatTheme.md
            reuseItems: true
            model: root.session ? root.session.messages : null
            ScrollBar.vertical: ScrollBar {}
            onMovementEnded: {
                root.followBottom = atYEnd;
                root.captureAnchor();
            }
            onContentHeightChanged: {
                if (root.followBottom) {
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
            delegate: Item {
                required property string messageId
                required property string role
                required property string text
                required property string timestamp
                required property var parts
                required property string status
                width: messages.width
                height: turn.implicitHeight
                MessageDelegate {
                    id: turn
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Math.min(parent.width, ChatTheme.columnWidth)
                    messageId: parent.messageId
                    role: parent.role
                    text: parent.text
                    timestamp: parent.timestamp
                    parts: parent.parts
                    status: parent.status
                    session: root.session
                }
            }
            ColumnLayout {
                anchors.centerIn: parent
                visible: !!root.session && root.session.historyLoading
                spacing: ChatTheme.md
                BusyIndicator {
                    objectName: "chatHistoryLoadingIndicator"
                    Layout.alignment: Qt.AlignHCenter
                    running: parent.visible
                    Accessible.name: qsTr("Loading conversation")
                }
                Label {
                    objectName: "chatHistoryLoadingLabel"
                    text: qsTr("Loading conversation…")
                    color: ChatTheme.muted
                }
            }
            ColumnLayout {
                anchors.centerIn: parent
                width: parent.width - ChatTheme.xl * 2
                visible: messages.count === 0 && !(root.session && root.session.historyLoading)
                spacing: ChatTheme.xl
                Label {
                    objectName: "chatHistoryEmptyPrompt"
                    Layout.fillWidth: true
                    text: qsTr("What do you want to create?")
                    font.pixelSize: ChatTheme.title
                    font.weight: Font.DemiBold
                    wrapMode: Text.WordWrap
                    horizontalAlignment: Text.AlignHCenter
                    color: ChatTheme.text
                }
                Label {
                    Layout.fillWidth: true
                    text: root.session && root.session.selectedThreadId ? qsTr("Describe what you want to make below.") : qsTr("Start a new chat to work with an agent.")
                    wrapMode: Text.WordWrap
                    horizontalAlignment: Text.AlignHCenter
                    color: ChatTheme.muted
                }
                ChatButton {
                    Layout.alignment: Qt.AlignHCenter
                    visible: !root.session || !root.session.selectedThreadId
                    text: qsTr("New chat")
                    enabled: !!root.session && root.session.connectionStatus === "connected"
                    onClicked: root.session.createThread()
                }
            }
        }
        ChatButton {
            Layout.alignment: Qt.AlignHCenter
            visible: !root.followBottom
            text: qsTr("Latest messages")
            onClicked: {
                root.followBottom = true;
                messages.positionViewAtEnd();
            }
        }
        ChatComposer {
            Layout.fillWidth: true
            Layout.maximumWidth: ChatTheme.columnWidth
            Layout.alignment: Qt.AlignHCenter
            visible: !!root.session && !!root.session.selectedThreadId
            session: root.session
        }
    }
    Connections {
        target: root.session
        function onStateChanged() {
            if (root.session.selectedThreadId !== root.previousThread) {
                root.savePosition();
                root.restorePosition();
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
}

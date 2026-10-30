pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Page {
    id: root
    required property var session
    signal threadOpened()
    objectName: "chatThreads"
    background: Rectangle { color: ChatTheme.background }
    header: RowLayout {
        spacing: ChatTheme.md
        Label { text: qsTr("Chats"); color: ChatTheme.text; font.pixelSize: ChatTheme.body; Layout.fillWidth: true; leftPadding: ChatTheme.lg }
        ChatButton { objectName: "newChat"; text: qsTr("New chat"); enabled: !!root.session && root.session.connectionStatus === "connected"; onClicked: { root.session.createThread(); root.threadOpened() } }
    }
    ListView {
        id: threads
        anchors.fill: parent
        anchors.margins: ChatTheme.md
        clip: true
        model: root.session ? root.session.threads : null
        spacing: ChatTheme.xs
        reuseItems: true
        ScrollBar.vertical: ScrollBar {}
        delegate: ItemDelegate {
            id: threadRow
            required property string threadId
            required property string title
            required property string status
            width: threads.width
            text: title || qsTr("Untitled chat")
            highlighted: root.session && root.session.selectedThreadId === threadId
            font.family: ChatTheme.sans
            font.pixelSize: ChatTheme.label
            Accessible.name: text + (status ? ", " + status : "")
            contentItem: Label { text: threadRow.text; color: ChatTheme.text; elide: Text.ElideRight; verticalAlignment: Text.AlignVCenter }
            background: Rectangle { color: threadRow.highlighted || threadRow.hovered ? ChatTheme.selected : ChatTheme.background; radius: ChatTheme.radius; border.color: threadRow.activeFocus ? ChatTheme.primary : "transparent" }
            onClicked: { root.session.selectThread(threadId); root.threadOpened() }
        }
        Label {
            anchors.centerIn: parent
            width: parent.width - ChatTheme.xl * 2
            visible: threads.count === 0
            text: root.session && root.session.connectionStatus === "connected" ? qsTr("Start a new chat to work with an agent.") : qsTr("Connect to NodeTool to start a chat.")
            wrapMode: Text.WordWrap
            color: ChatTheme.muted
            horizontalAlignment: Text.AlignHCenter
        }
    }
}

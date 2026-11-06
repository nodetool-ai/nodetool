pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property var session
    signal threadOpened
    objectName: "chatThreads"
    Ui.Surface { anchors.fill: parent; variant: Ui.Surface.Panel }
    RowLayout {
        id: threadHeader
        anchors.left: parent.left
        anchors.right: parent.right
        spacing: Ui.Metrics.md
        Ui.Text {
            role: Ui.Typography.SansLabel
            text: qsTr("Chats")
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.lg
        }
        Ui.EditorButton {
            objectName: "newChat"
            text: qsTr("New chat")
            variant: Ui.EditorButton.Flat
            enabled: !!root.session && root.session.connectionStatus === "connected"
            onClicked: {
                root.session.createThread();
                root.threadOpened();
            }
        }
    }
    ListView {
        id: threads
        anchors.top: threadHeader.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: Ui.Metrics.md
        clip: true
        model: root.session ? root.session.threads : null
        spacing: Ui.Metrics.xs
        reuseItems: true
        ScrollBar.vertical: Ui.ScrollBar {}
        delegate: Ui.EditorButton {
            id: threadRow
            required property string threadId
            required property string title
            required property string status
            width: threads.width
            text: title || qsTr("Untitled chat")
            variant: Ui.EditorButton.Flat
            contentAlignment: Qt.AlignLeft
            active: root.session && root.session.selectedThreadId === threadId
            accessibleName: text + (status ? ", " + status : "")
            onClicked: {
                root.session.selectThread(threadId);
                root.threadOpened();
            }
        }
        Ui.Text {
            role: Ui.Typography.SansLabel
            anchors.centerIn: parent
            width: parent.width - Ui.Metrics.xl * 2
            visible: threads.count === 0
            text: root.session && root.session.connectionStatus === "connected" ? qsTr("Start a new chat to work with an agent.") : qsTr("Connect to NodeTool to start a chat.")
            wrapMode: Text.WordWrap
            tone: Ui.Text.Secondary
            horizontalAlignment: Text.AlignHCenter
        }
    }
}

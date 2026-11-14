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
        delegate: Item {
            id: threadRow
            required property string threadId
            required property string title
            required property string status
            readonly property string label: title || qsTr("Untitled chat")
            property bool renaming: false
            width: threads.width
            implicitHeight: Math.max(openButton.implicitHeight, renameField.implicitHeight)
            height: implicitHeight
            onThreadIdChanged: renaming = false
            function startRename() {
                renaming = true
                renameField.text = label
                renameField.forceActiveFocus()
                renameField.selectAll()
            }
            function finishRename() {
                if (!renaming) return
                renaming = false
                root.session.renameThread(threadId, renameField.text)
            }
            Ui.EditorButton {
                id: openButton
                objectName: "chatThreadRow"
                anchors.left: parent.left
                anchors.right: moreButton.left
                anchors.rightMargin: Ui.Metrics.xs
                visible: !threadRow.renaming
                text: threadRow.label
                variant: Ui.EditorButton.Flat
                contentAlignment: Qt.AlignLeft
                active: root.session && root.session.selectedThreadId === threadRow.threadId
                accessibleName: text + (threadRow.status ? ", " + threadRow.status : "")
                onClicked: {
                    root.session.selectThread(threadRow.threadId);
                    root.threadOpened();
                }
                TapHandler {
                    acceptedButtons: Qt.RightButton
                    onTapped: (eventPoint) => threadMenu.popupAt(openButton, eventPoint.position.x, eventPoint.position.y)
                }
                Keys.onPressed: (event) => {
                    if (event.key === Qt.Key_F2) { threadRow.startRename(); event.accepted = true }
                    else if (event.key === Qt.Key_Delete) { deleteDialog.openFor(threadRow.threadId, threadRow.label); event.accepted = true }
                }
            }
            Ui.ToolbarIconButton {
                id: moreButton
                objectName: "chatThreadMore"
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                visible: !threadRow.renaming
                iconName: "moreHoriz"
                text: qsTr("Rename or delete %1").arg(threadRow.label)
                accessibleName: text
                onClicked: threadMenu.openAt(moreButton)
            }
            Ui.TextField {
                id: renameField
                objectName: "chatThreadRename"
                anchors.left: parent.left
                anchors.right: parent.right
                visible: threadRow.renaming
                accessibleName: qsTr("Conversation name")
                onAccepted: threadRow.finishRename()
                onActiveFocusChanged: if (!activeFocus) threadRow.finishRename()
                Keys.onEscapePressed: threadRow.renaming = false
            }
            Ui.ContextMenu {
                id: threadMenu
                Ui.MenuItem {
                    objectName: "chatThreadRenameItem"
                    text: qsTr("Rename")
                    iconName: "rename"
                    onTriggered: threadRow.startRename()
                }
                Ui.MenuItem {
                    objectName: "chatThreadDeleteItem"
                    text: qsTr("Delete")
                    iconName: "deleteOutline"
                    onTriggered: deleteDialog.openFor(threadRow.threadId, threadRow.label)
                }
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
    Ui.Dialog {
        id: deleteDialog
        objectName: "chatDeleteDialog"
        property string threadId: ""
        property string label: ""
        title: qsTr("Delete this conversation?")
        width: Math.min(420 * Ui.Theme.uiScale, (root.Window.window ? root.Window.window.width : 420) - Ui.Metrics.xl * 2)
        function openFor(id, name) {
            threadId = id
            label = name
            open()
        }
        ColumnLayout {
            width: parent.width
            spacing: Ui.Metrics.lg
            Ui.Text {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                text: qsTr("“%1” and its messages are removed for good.").arg(deleteDialog.label)
            }
            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: Ui.Metrics.md
                Ui.EditorButton { text: qsTr("Cancel"); onClicked: deleteDialog.close() }
                Ui.EditorButton {
                    objectName: "chatDeleteConfirm"
                    text: qsTr("Delete")
                    variant: Ui.EditorButton.Destructive
                    onClicked: {
                        root.session.deleteThread(deleteDialog.threadId)
                        deleteDialog.close()
                    }
                }
            }
        }
    }
}

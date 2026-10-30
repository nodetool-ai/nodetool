pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Control {
    id: root
    palette.window: ChatTheme.background
    palette.base: ChatTheme.paper
    palette.button: ChatTheme.paper
    palette.text: ChatTheme.text
    palette.windowText: ChatTheme.text
    palette.buttonText: ChatTheme.text
    palette.highlight: ChatTheme.primary
    palette.highlightedText: ChatTheme.text
    font.family: ChatTheme.sans
    font.pixelSize: ChatTheme.label
    property var session: null
    readonly property bool narrow: width < ChatTheme.narrow
    property var scrollPositions: ({})
    objectName: "chatPanel"
    Rectangle {
        anchors.fill: parent
        color: ChatTheme.background
    }
    ColumnLayout {
        anchors.fill: parent
        spacing: 0
        RowLayout {
            Layout.fillWidth: true
            Layout.margins: ChatTheme.md
            Label {
                Layout.fillWidth: true
                text: root.session ? root.session.connectionStatus : qsTr("Disconnected")
                color: ChatTheme.muted
                font.pixelSize: ChatTheme.caption
            }
            ChatButton {
                flat: true
                text: qsTr("Reconnect")
                visible: !!root.session && root.session.connectionStatus === "disconnected" && root.session.selectedThreadId.length > 0
                onClicked: root.session.resumeConnection()
            }
            ChatButton {
                flat: true
                glyph: "⚙"
                text: qsTr("Connection")
                onClicked: connection.open()
            }
        }
        Label {
            Layout.fillWidth: true
            Layout.margins: ChatTheme.md
            visible: text.length > 0
            text: root.session ? root.session.error : ""
            color: ChatTheme.error
            wrapMode: Text.WordWrap
            Accessible.role: Accessible.AlertMessage
        }
        Loader {
            Layout.fillWidth: true
            Layout.fillHeight: true
            sourceComponent: root.narrow ? narrowContent : wideContent
        }
    }
    Component {
        id: wideContent
        RowLayout {
            spacing: 0
            ThreadList {
                Layout.preferredWidth: ChatTheme.sidebar
                Layout.fillHeight: true
                session: root.session
            }
            Rectangle {
                Layout.fillHeight: true
                width: 1
                color: ChatTheme.divider
            }
            ConversationView {
                Layout.fillWidth: true
                Layout.fillHeight: true
                session: root.session
                scrollPositions: root.scrollPositions
            }
        }
    }
    Component {
        id: narrowContent
        StackView {
            id: navigation
            initialItem: ConversationView {
                session: root.session
                scrollPositions: root.scrollPositions
                showBack: true
                onBackRequested: navigation.push(threadPicker)
            }
            Component {
                id: threadPicker
                ThreadList {
                    session: root.session
                    onThreadOpened: navigation.pop()
                }
            }
        }
    }
    Dialog {
        id: connection
        title: qsTr("Connect to NodeTool")
        anchors.centerIn: parent
        width: Math.min(root.width - ChatTheme.xl * 2, 440)
        modal: true
        standardButtons: Dialog.Close
        ColumnLayout {
            width: parent.width
            Label {
                text: qsTr("Server address")
                color: ChatTheme.text
            }
            TextField {
                id: server
                Layout.fillWidth: true
                text: "http://localhost:7777"
                Accessible.name: qsTr("Server address")
                selectByMouse: true
            }
            Label {
                text: qsTr("Access token")
                color: ChatTheme.text
            }
            TextField {
                id: token
                Layout.fillWidth: true
                echoMode: TextInput.Password
                Accessible.name: qsTr("Access token")
                placeholderText: qsTr("Leave empty for local authentication")
            }
            RowLayout {
                ChatButton {
                    text: qsTr("Connect")
                    enabled: !!root.session && server.text.length > 0
                    onClicked: {
                        root.session.connectToServer(server.text, token.text);
                        token.clear();
                        connection.close();
                    }
                }
                ChatButton {
                    text: qsTr("Disconnect")
                    enabled: !!root.session
                    onClicked: {
                        root.session.disconnectFromServer();
                        token.clear();
                        connection.close();
                    }
                }
            }
        }
    }
}

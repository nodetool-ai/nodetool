pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    property var session: null
    readonly property bool narrow: width < ChatMetrics.narrow
    property var scrollPositions: ({})
    property bool threadPickerActive: false
    onNarrowChanged: if (!narrow) threadPickerActive = false
    objectName: "chatPanel"
    Ui.Surface { anchors.fill: parent; variant: Ui.Surface.Canvas }
    ColumnLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.none
        RowLayout {
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.md
            Ui.Text {
                objectName: "chatConnectionStatus"
                role: Ui.Typography.SansCaption
                Layout.fillWidth: true
                text: root.session ? root.session.connectionStatus : qsTr("Disconnected")
                tone: Ui.Text.Secondary
            }
            Ui.EditorButton {
                variant: Ui.EditorButton.Flat
                text: qsTr("Reconnect")
                visible: !!root.session && root.session.connectionStatus === "disconnected" && root.session.selectedThreadId.length > 0
                onClicked: root.session.resumeConnection()
            }
            Ui.ToolbarIconButton {
                id: connectionButton
                variant: Ui.EditorButton.Flat
                iconName: "settings"
                text: qsTr("Connection")
                onClicked: connection.open()
            }
        }
        Ui.Text {
            role: Ui.Typography.SansLabel
            Layout.fillWidth: true
            Layout.margins: Ui.Metrics.md
            visible: text.length > 0
            text: root.session ? root.session.error : ""
            tone: Ui.Text.Error
            wrapMode: Text.WordWrap
            Accessible.role: Accessible.AlertMessage
        }
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: Ui.Metrics.none
            Loader {
                Layout.preferredWidth: ChatMetrics.sidebar
                Layout.fillHeight: true
                active: !root.narrow
                visible: active
                sourceComponent: ThreadList { session: root.session }
            }
            Ui.Separator {
                Layout.fillHeight: true
                visible: !root.narrow
                orientation: Qt.Vertical
            }
            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true
                ConversationView {
                    anchors.fill: parent
                    visible: !root.narrow || !root.threadPickerActive
                    session: root.session
                    scrollPositions: root.scrollPositions
                    showBack: root.narrow
                    onBackRequested: root.threadPickerActive = true
                }
                Loader {
                    anchors.fill: parent
                    active: root.narrow && root.threadPickerActive
                    sourceComponent: ThreadList {
                        session: root.session
                        onThreadOpened: root.threadPickerActive = false
                    }
                }
            }
        }
    }
    Ui.Dialog {
        id: connection
        title: qsTr("Connect to NodeTool")
        width: Math.min(root.width - Ui.Metrics.xl * 2, 440)
        returnFocusTo: connectionButton
        ColumnLayout {
            width: parent.width
            Ui.Text {
                role: Ui.Typography.SansLabel
                text: qsTr("Server address")
            }
            Ui.TextField {
                id: server
                Layout.fillWidth: true
                value: "http://localhost:7777"
                accessibleName: qsTr("Server address")
                selectByMouse: true
            }
            Ui.Text {
                role: Ui.Typography.SansLabel
                text: qsTr("Access token")
            }
            Ui.TextField {
                id: token
                Layout.fillWidth: true
                echoMode: TextInput.Password
                accessibleName: qsTr("Access token")
                placeholderText: qsTr("Leave empty for local authentication")
            }
            RowLayout {
                Ui.EditorButton {
                    text: qsTr("Connect")
                    enabled: !!root.session && server.text.length > 0
                    onClicked: {
                        root.session.connectToServer(server.text, token.text);
                        token.clear();
                        connection.close();
                    }
                }
                Ui.EditorButton {
                    text: qsTr("Disconnect")
                    enabled: !!root.session
                    onClicked: {
                        root.session.disconnectFromServer();
                        token.clear();
                        connection.close();
                    }
                }
                Ui.EditorButton { text: qsTr("Close"); onClicked: connection.close() }
            }
        }
    }
}

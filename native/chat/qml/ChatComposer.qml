pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs

ColumnLayout {
    id: root
    required property var session
    readonly property bool running: session && ["loading", "running", "streaming", "sending", "stopping"].indexOf(session.turnStatus) >= 0
    spacing: ChatTheme.md
    objectName: "chatComposer"
    function focusEditor() { editor.forceActiveFocus() }
    RowLayout {
        Layout.fillWidth: true
        Label { text: qsTr("Provider"); color: ChatTheme.muted }
        TextField {
            objectName: "chatProvider"
            Layout.fillWidth: true
            text: root.session ? root.session.provider : ""
            placeholderText: qsTr("Server default")
            Accessible.name: qsTr("Provider")
            onTextEdited: { if (root.session) root.session.provider = text }
        }
        Label { text: qsTr("Model"); color: ChatTheme.muted }
        TextField {
            objectName: "chatModel"
            Layout.fillWidth: true
            text: root.session ? root.session.model : ""
            placeholderText: qsTr("Server default")
            Accessible.name: qsTr("Model")
            onTextEdited: { if (root.session) root.session.model = text }
        }
    }
    ScrollView {
        Layout.fillWidth: true
        Layout.preferredHeight: Math.min(ChatTheme.control * 5, Math.max(ChatTheme.control * 2, editor.implicitHeight))
        TextArea {
            id: editor
            objectName: "chatInput"
            text: root.session ? root.session.draft : ""
            placeholderText: qsTr("Describe what you want to make…")
            color: ChatTheme.text
            placeholderTextColor: ChatTheme.muted
            selectionColor: ChatTheme.primary
            wrapMode: TextEdit.Wrap
            selectByMouse: true
            font.family: ChatTheme.sans
            font.pixelSize: ChatTheme.body
            Accessible.name: qsTr("Message")
            background: Rectangle { color: ChatTheme.paper; radius: ChatTheme.radius; border.color: editor.activeFocus ? ChatTheme.primary : ChatTheme.divider }
            onTextChanged: { if (root.session && root.session.draft !== text) root.session.draft = text }
            // Enter inserts a line. Ctrl/Cmd+Enter submits only after IME composition.
            Keys.onPressed: event => {
                if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && (event.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) && !inputMethodComposing) {
                    if (!root.running && text.trim() && root.session) root.session.send()
                    event.accepted = true
                }
            }
        }
    }
    Repeater {
        model: root.session ? root.session.attachments : []
        delegate: RowLayout {
            id: attachmentRow
            required property var modelData
            Layout.fillWidth: true
            Label { Layout.fillWidth: true; text: attachmentRow.modelData.name + " · " + attachmentRow.modelData.status; color: ChatTheme.muted; elide: Text.ElideMiddle }
            ProgressBar { from: 0; to: 100; visible: attachmentRow.modelData.status === "uploading"; value: attachmentRow.modelData.progress || 0 }
            ChatButton { text: attachmentRow.modelData.status === "uploading" ? qsTr("Cancel upload") : qsTr("Remove"); onClicked: root.session.removeAttachment(attachmentRow.modelData.id) }
        }
    }
    RowLayout {
        Layout.fillWidth: true
        ChatButton { text: qsTr("Attach file"); enabled: !!root.session && !root.running; onClicked: fileDialog.open() }
        Label { Layout.fillWidth: true; text: qsTr("Enter for a new line · Ctrl+Enter to send"); color: ChatTheme.muted; font.pixelSize: ChatTheme.caption; wrapMode: Text.WordWrap }
        ChatButton {
            objectName: "sendMessage"
            text: root.running ? qsTr("Stop") : qsTr("Send")
            enabled: !!root.session && root.session.turnStatus !== "stopping" && (root.running || editor.text.trim().length > 0)
            onClicked: { if (root.running) root.session.stop(); else root.session.send() }
        }
    }
    FileDialog { id: fileDialog; title: qsTr("Attach a file"); onAccepted: root.session.addAttachment(selectedFile) }
}

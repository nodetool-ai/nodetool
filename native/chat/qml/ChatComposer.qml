pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs

Frame {
    id: root
    required property var session
    readonly property bool running: session && ["loading", "running", "streaming", "sending", "stopping"].indexOf(session.turnStatus) >= 0
    padding: ChatTheme.md
    background: Rectangle {
        color: ChatTheme.background
        radius: ChatTheme.cardRadius
        border.color: editor.activeFocus ? ChatTheme.focus : ChatTheme.divider
    }
    objectName: "chatComposer"
    function focusEditor() {
        editor.forceActiveFocus();
    }
    ColumnLayout {
        width: parent.width
        spacing: ChatTheme.md
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
                padding: ChatTheme.xl
                background: null
                onTextChanged: {
                    if (root.session && root.session.draft !== text) {
                        root.session.draft = text;
                    }
                }
                // Enter inserts a line. Ctrl/Cmd+Enter submits only after IME composition.
                Keys.onPressed: event => {
                    if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && (event.modifiers & (Qt.ControlModifier | Qt.MetaModifier)) && !inputMethodComposing) {
                        if (!root.running && text.trim() && root.session) {
                            root.session.send();
                        }
                        event.accepted = true;
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
                Label {
                    Layout.fillWidth: true
                    text: attachmentRow.modelData.name + " · " + attachmentRow.modelData.status
                    color: ChatTheme.muted
                    elide: Text.ElideMiddle
                }
                ProgressBar {
                    from: 0
                    to: 100
                    visible: attachmentRow.modelData.status === "uploading"
                    value: attachmentRow.modelData.progress || 0
                }
                ChatButton {
                    text: attachmentRow.modelData.status === "uploading" ? qsTr("Cancel upload") : qsTr("Remove")
                    onClicked: root.session.removeAttachment(attachmentRow.modelData.id)
                }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            ChatButton {
                text: qsTr("Attach file")
                glyph: "+"
                flat: true
                enabled: !!root.session && !root.running
                onClicked: fileDialog.open()
            }
            ChatButton {
                Layout.maximumWidth: Math.max(ChatTheme.control, root.width - ChatTheme.control * 3)
                flat: true
                id: modelChooser
                objectName: "chooseChatModel"
                text: root.session && root.session.model ? root.session.model + " ⌄" : qsTr("Default model ⌄")
                Accessible.name: qsTr("Choose provider and model")
                onClicked: modelPicker.open()
            }
            Item {
                Layout.fillWidth: true
            }

            ChatButton {
                objectName: "sendMessage"
                text: root.running ? qsTr("Stop") : qsTr("Send")
                glyph: root.running ? "■" : "↑"
                primary: true
                Layout.preferredWidth: ChatTheme.xxxl
                implicitHeight: ChatTheme.xxxl
                enabled: !!root.session && root.session.turnStatus !== "stopping" && (root.running || editor.text.trim().length > 0)
                onClicked: {
                    if (root.running) {
                        root.session.stop();
                    }
                    else {
                        root.session.send();
                    }
                }
            }
        }
    }
    component ModelField: TextField {
        font.family: ChatTheme.sans
        font.pixelSize: ChatTheme.label
        color: ChatTheme.text
        placeholderTextColor: ChatTheme.muted
        selectionColor: ChatTheme.primary
        selectByMouse: true
        padding: ChatTheme.lg
        background: Rectangle {
            color: ChatTheme.background
            radius: ChatTheme.radius
            border.color: parent.activeFocus ? ChatTheme.primary : ChatTheme.divider
        }
    }
    Popup {
        id: modelPicker
        modal: true
        focus: true
        onOpened: providerField.forceActiveFocus()
        onClosed: modelChooser.forceActiveFocus()
        width: Math.min(root.width, ChatTheme.sidebar + ChatTheme.xxl)
        y: -height - ChatTheme.md
        padding: ChatTheme.xl
        background: Rectangle {
            color: ChatTheme.paper
            radius: ChatTheme.bubbleRadius
            border.color: ChatTheme.divider
        }
        contentItem: ColumnLayout {
            Label {
                text: qsTr("Provider and model")
                color: ChatTheme.text
                font.weight: Font.Medium
            }
            ColumnLayout {
                Layout.fillWidth: true
                Label {
                    text: qsTr("Provider")
                    color: ChatTheme.muted
                }
                ModelField {
                    id: providerField
                    objectName: "chatProvider"
                    Layout.fillWidth: true
                    text: root.session ? root.session.provider : ""
                    placeholderText: qsTr("Server default")
                    Accessible.name: qsTr("Provider")
                    onTextEdited: {
                        if (root.session) {
                            root.session.provider = text;
                        }
                    }
                }
                Label {
                    text: qsTr("Model")
                    color: ChatTheme.muted
                }
                ModelField {
                    objectName: "chatModel"
                    Layout.fillWidth: true
                    text: root.session ? root.session.model : ""
                    placeholderText: qsTr("Server default")
                    Accessible.name: qsTr("Model")
                    onTextEdited: {
                        if (root.session) {
                            root.session.model = text;
                        }
                    }
                }
            }
            Label {
                Layout.fillWidth: true
                text: qsTr("Leave empty to use server defaults.")
                color: ChatTheme.muted
                wrapMode: Text.WordWrap
            }
        }
    }
    FileDialog {
        id: fileDialog
        title: qsTr("Attach a file")
        onAccepted: root.session.addAttachment(selectedFile)
    }
}

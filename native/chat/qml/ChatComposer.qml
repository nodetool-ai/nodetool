pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import QtQuick.Dialogs
import NodeTool.ModelPicker

Ui.Surface {
    id: root
    required property var session
    property string previousThread: ""
    readonly property bool running: session && ["loading", "running", "streaming", "sending", "stopping"].indexOf(session.turnStatus) >= 0
    variant: Ui.Surface.Panel
    implicitHeight: composerContent.implicitHeight + Ui.Metrics.md * 2
    objectName: "chatComposer"
    function focusEditor() {
        editor.forceActiveFocus();
    }
    ColumnLayout {
        id: composerContent
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.md
        ScrollView {
            Layout.fillWidth: true
            Layout.preferredHeight: Math.min(Ui.Metrics.comfortable * 5, Math.max(Ui.Metrics.comfortable * 2, editor.implicitHeight))
            Ui.TextArea {
                id: editor
                objectName: "chatInput"
                value: root.session ? root.session.draft : ""
                placeholderText: qsTr("Describe what you want to make…")
                wrapMode: TextEdit.Wrap
                selectByMouse: true
                accessibleName: qsTr("Message")
                onValuePreviewed: value => {
                    if (root.session && root.session.draft !== value) root.session.draft = value
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
                Ui.Text {
                    role: Ui.Typography.SansLabel
                    Layout.fillWidth: true
                    text: attachmentRow.modelData.name + " · " + attachmentRow.modelData.status
                    tone: Ui.Text.Secondary
                    elide: Text.ElideMiddle
                }
                Ui.Progress {
                    accessibleName: qsTr("Attachment upload progress")
                    from: 0
                    to: 100
                    visible: attachmentRow.modelData.status === "uploading"
                    value: attachmentRow.modelData.progress || 0
                }
                Ui.EditorButton {
                    text: attachmentRow.modelData.status === "uploading" ? qsTr("Cancel upload") : qsTr("Remove")
                    onClicked: root.session.removeAttachment(attachmentRow.modelData.id)
                }
            }
        }
        RowLayout {
            Layout.fillWidth: true
            Ui.ToolbarIconButton {
                text: qsTr("Attach file")
                iconName: "add"
                variant: Ui.EditorButton.Flat
                enabled: !!root.session && !root.running
                onClicked: fileDialog.open()
            }
            Ui.EditorButton {
                Layout.maximumWidth: Math.max(Ui.Metrics.comfortable, root.width - Ui.Metrics.comfortable * 3)
                variant: Ui.EditorButton.Flat
                id: modelChooser
                objectName: "chooseChatModel"
                text: root.session && root.session.model
                      ? root.session.model + (root.session.modelCatalog.loaded && !root.session.modelCatalog.selectionAvailable ? qsTr(" (Unavailable)") : "")
                      : qsTr("Default model")
                accessibleName: qsTr("Choose provider and model")
                trailingIconName: "arrowDropDown"
                menuButton: true
                menuExpanded: modelPickerLoader.item ? modelPickerLoader.item.visible : false
                enabled: !!modelPickerLoader.item
                onClicked: modelPickerLoader.item.openAt(modelChooser)
            }
            Item {
                Layout.fillWidth: true
            }

            Ui.ToolbarIconButton {
                objectName: "sendMessage"
                text: root.running ? qsTr("Stop") : qsTr("Send")
                iconName: root.running ? "stop" : "send"
                variant: Ui.EditorButton.Primary
                Layout.preferredWidth: Ui.Metrics.xxxl
                implicitHeight: Ui.Metrics.xxxl
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
    Component.onCompleted: previousThread = session ? session.selectedThreadId : ""
    Connections {
        target: root.session
        function onStateChanged() {
            if (root.session.selectedThreadId !== root.previousThread) {
                root.previousThread = root.session.selectedThreadId
                editor.cancelEdit()
            }
        }
    }
    Loader {
        id: modelPickerLoader
        active: !!root.session && !!root.session.modelCatalog
        sourceComponent: ModelPicker {
            catalog: root.session.modelCatalog
            allowServerDefault: true
            onUseServerDefaultRequested: {
                root.session.useServerDefaultModel()
                close()
            }
            onAddProvidersRequested: root.session.openProviderSettings()
        }
    }
    FileDialog {
        id: fileDialog
        title: qsTr("Attach a file")
        onAccepted: root.session.addAttachment(selectedFile)
    }
}

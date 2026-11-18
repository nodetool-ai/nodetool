import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// Confirms deleting a conversation, from the thread list or the title menu.
Ui.Dialog {
    id: root
    property var session: null
    property string threadId: ""
    property string label: ""
    title: qsTr("Delete this conversation?")
    width: Math.min(420 * Ui.Theme.uiScale, (parent && parent.Window.window ? parent.Window.window.width : 420) - Ui.Metrics.xl * 2)
    function openFor(id, name) {
        threadId = id
        label = name
        open()
    }
    function confirm() {
        root.session.deleteThread(root.threadId)
        root.close()
    }
    ColumnLayout {
        width: parent.width
        spacing: Ui.Metrics.lg
        Ui.Text {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            text: qsTr("“%1” and its messages are removed for good.").arg(root.label)
        }
        RowLayout {
            Layout.alignment: Qt.AlignRight
            spacing: Ui.Metrics.md
            Ui.EditorButton { text: qsTr("Cancel"); onClicked: root.close() }
            Ui.EditorButton {
                objectName: "chatDeleteConfirm"
                text: qsTr("Delete")
                variant: Ui.EditorButton.Destructive
                onClicked: root.confirm()
            }
        }
    }
}

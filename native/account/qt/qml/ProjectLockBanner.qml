import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The project lock of the open project (WP2.13, AC25): another app on this
// computer or another computer has the project open, so this window opens it
// read-only and names the holder. Check again takes the lock once the other
// app closed it. For another computer, Open for editing asks whether that
// computer still has the project open, then takes the lock over.
Item {
    id: root
    objectName: "projectLockBanner"
    required property ProjectLockState lock
    readonly property string lockState: root.lock ? root.lock.state : ""
    visible: lockState === "heldHere" || lockState === "heldElsewhere" || lockState === "failed"
    implicitWidth: banner.implicitWidth
    implicitHeight: visible ? banner.implicitHeight : 0

    Ui.Banner {
        id: banner
        width: root.width
        status: Ui.Status.Warning
        message: root.lock ? root.lock.message : ""
        actionText: root.lockState === "heldElsewhere" ? qsTr("Open for editing…") : qsTr("Check again")
        onActionTriggered: {
            if (root.lockState === "heldElsewhere") {
                confirm.open()
            } else if (root.lock) {
                root.lock.retry()
            }
        }
    }

    Ui.Dialog {
        id: confirm
        objectName: "projectLockTakeOver"
        title: qsTr("Open for editing here?")
        width: Math.min(Ui.Metrics.dialogWidth, parent ? parent.width : Ui.Metrics.dialogWidth)
        returnFocusTo: banner
        ColumnLayout {
            width: parent ? parent.width : implicitWidth
            spacing: Ui.Metrics.lg
            Ui.Text {
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
                text: root.lock
                      ? qsTr("Only continue if %1 does not have this project open. If both computers change it, one of them overwrites the other's changes.").arg(root.lock.holderHost)
                      : ""
            }
            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: Ui.Metrics.sm
                Ui.EditorButton { objectName: "projectLockTakeOverCancel"; text: qsTr("Cancel"); onClicked: confirm.close() }
                Ui.EditorButton {
                    objectName: "projectLockTakeOverConfirm"
                    text: qsTr("Open for editing")
                    onClicked: {
                        confirm.close()
                        if (root.lock) root.lock.takeOver()
                    }
                }
            }
        }
    }
}

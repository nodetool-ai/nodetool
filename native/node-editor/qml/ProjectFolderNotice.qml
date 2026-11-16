import QtQuick
import QtQuick.Dialogs
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The folder of the tab's project at the top of the panels that list its
// workflows and assets: where the folder is, a file manager for it, and
// Locate when the server cannot reach it. The wording is the web's
// projectFolder strings in web/src/i18n/locales/en.json.
ColumnLayout {
    id: root
    required property ProjectFolder folder
    spacing: Ui.Metrics.xs
    visible: folder.folderState !== "" || folder.locateError !== ""
    // Banner messages are styled text, and names and server errors are not markup.
    function escaped(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }
    function notice(title, body) {
        return "<b>" + escaped(title) + "</b><br>" + escaped(body)
    }
    RowLayout {
        objectName: "project-folder-path"
        Layout.fillWidth: true
        visible: root.folder.folderState === "ok" && root.folder.folderPath !== ""
        spacing: Ui.Metrics.sm
        Ui.Text {
            Layout.fillWidth: true
            text: root.folder.folderPath
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            elide: Text.ElideMiddle
            Accessible.name: qsTr("Project folder %1").arg(root.folder.folderPath)
        }
        Ui.EditorButton {
            objectName: "project-folder-reveal"
            visible: root.folder.revealable
            text: root.folder.revealLabel
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            onClicked: root.folder.reveal()
        }
    }
    Ui.Banner {
        objectName: "project-folder-missing"
        Layout.fillWidth: true
        visible: root.folder.folderState === "missing"
        status: Ui.Status.Warning
        textFormat: Text.StyledText
        message: root.notice(qsTr("Folder not found"),
                             qsTr("The folder of %1 was moved, renamed, or is on a drive that is not connected. Runs cannot start until you locate it.").arg(root.folder.projectName))
        actionText: qsTr("Locate")
        onActionTriggered: locateDialog.open()
    }
    Ui.Banner {
        objectName: "project-folder-none"
        Layout.fillWidth: true
        visible: root.folder.folderState === "none"
        status: Ui.Status.Info
        textFormat: Text.StyledText
        message: root.notice(qsTr("No project folder"), qsTr("This project has no folder yet."))
    }
    Ui.Banner {
        objectName: "project-folder-locate-error"
        Layout.fillWidth: true
        visible: root.folder.locateError !== ""
        status: Ui.Status.Error
        message: root.folder.locateError
    }
    FolderDialog {
        id: locateDialog
        objectName: "project-folder-locate-dialog"
        title: qsTr("Locate")
        onAccepted: root.folder.locate(selectedFolder)
    }
}

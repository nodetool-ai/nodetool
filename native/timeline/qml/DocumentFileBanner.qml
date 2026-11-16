// The state of the open timeline's file in its project folder, under the save
// banners (ProjectFolderState.fileState):
// - invalid: an edit to the file was refused. The editor keeps the last
//   valid version, and the server's error says why.
// - missing: the file is gone. Restore writes it again from this document.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    objectName: "documentFileBanner"
    property ProjectFolderState folder: null
    readonly property string fileState: folder !== null ? folder.fileState : ""
    readonly property string path: folder !== null && folder.filePath !== "" ? folder.filePath : "The file"
    spacing: Ui.Metrics.xs
    visible: fileState === "invalid" || fileState === "missing"
    leftPadding: Ui.Metrics.md
    rightPadding: Ui.Metrics.md
    bottomPadding: visible ? Ui.Metrics.xs : 0

    Ui.Banner {
        objectName: "documentFileInvalid"
        width: root.width - root.leftPadding - root.rightPadding
        visible: root.fileState === "invalid"
        status: Ui.Status.Error
        message: "This file has an error. " + root.path + " was not loaded: "
                 + (root.folder !== null ? root.folder.fileError : "")
                 + ". The last valid version stays open and still runs."
    }
    Ui.Banner {
        objectName: "documentFileMissing"
        width: root.width - root.leftPadding - root.rightPadding
        visible: root.fileState === "missing"
        status: Ui.Status.Warning
        message: "File missing. " + root.path + " is no longer in the project folder. Restore writes it again from this document."
        actionText: "Restore"
        onActionTriggered: if (root.folder !== null && !root.folder.busy) root.folder.restoreFile()
    }
    Ui.Text {
        objectName: "documentFileRestoreError"
        width: root.width - root.leftPadding - root.rightPadding
        visible: root.fileState === "missing" && root.folder !== null && root.folder.restoreError !== ""
        text: root.folder !== null ? root.folder.restoreError : ""
        wrapMode: Text.WordWrap
        tone: Ui.Text.Error
        role: Ui.Typography.SansLabel
        Accessible.role: Accessible.AlertMessage
    }
}

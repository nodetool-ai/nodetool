// The folder of the Library's project, in the Library header
// (ProjectFolderState). It shows the folder's path with Show in file manager
// when the folder is on this machine, "Folder not found" with Locate when the
// server cannot reach it, and "No project folder" for a project without one.
// A cloud folder has no path, so nothing shows for it.
import QtQuick
import QtQuick.Dialogs
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    objectName: "projectFolderNotice"
    property ProjectFolderState folder: null
    property bool showRevealButton: true
    property bool showMissingText: true
    readonly property bool known: folder !== null && folder.loaded && folder.projectId !== ""
    readonly property bool away: known && folder.hasFolder && !folder.folderAccessible
    readonly property bool shown: known && folder.hasFolder && folder.folderAccessible && folder.folderPath !== ""
    readonly property bool noFolder: known && !folder.hasFolder
    spacing: Ui.Metrics.xs
    visible: away || shown || (showMissingText && noFolder)

    RowLayout {
        Layout.fillWidth: true
        visible: root.shown
        spacing: Ui.Metrics.sm
        Ui.Icon { name: "folderOutlined"; size: Ui.Metrics.iconSm; tone: Ui.Text.Secondary }
        Ui.Text {
            objectName: "projectFolderPath"
            Layout.fillWidth: true
            text: root.folder !== null ? root.folder.folderPath : ""
            elide: Text.ElideMiddle
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            Accessible.name: "Project folder " + text
        }
        Ui.EditorButton {
            objectName: "projectFolderReveal"
            visible: root.showRevealButton && root.folder !== null && root.folder.canReveal
            density: Ui.EditorButton.Compact
            text: root.folder !== null ? root.folder.revealLabel() : ""
            onClicked: root.folder.reveal()
        }
    }
    Ui.Banner {
        objectName: "projectFolderNotFound"
        Layout.fillWidth: true
        visible: root.away
        status: Ui.Status.Warning
        message: "Folder not found. The folder of " + (root.folder !== null ? root.folder.projectName : "")
                 + " was moved, renamed, or is on a drive that is not connected. Runs cannot start until you locate it."
        actionText: "Locate"
        onActionTriggered: if (root.folder !== null && !root.folder.busy) locateDialog.open()
    }
    Ui.Text {
        objectName: "projectFolderLocateError"
        Layout.fillWidth: true
        visible: root.away && root.folder.locateError !== ""
        text: root.folder !== null ? root.folder.locateError : ""
        wrapMode: Text.WordWrap
        tone: Ui.Text.Error
        role: Ui.Typography.SansLabel
        Accessible.role: Accessible.AlertMessage
    }
    Ui.Text {
        objectName: "projectFolderMissing"
        Layout.fillWidth: true
        visible: root.showMissingText && root.noFolder
        text: "No project folder. This project has no folder yet."
        wrapMode: Text.WordWrap
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
    }
    FolderDialog {
        id: locateDialog
        title: "Locate the project folder"
        onAccepted: if (root.folder !== null) root.folder.locate(selectedFolder)
    }
}

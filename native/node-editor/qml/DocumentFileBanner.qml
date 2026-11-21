import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// What is wrong with the file of the open workflow in its project folder,
// above the canvas: web/src/components/workspace/DocumentFileNotice.tsx. An
// invalid file shows its error, and a missing one offers Restore. The project
// lock banner names another app that has the project open, which makes the
// tab read-only (WP2.13). It takes no height while all is fine.
Rectangle {
    id: root
    required property ProjectFolder folder
    EditorRoles { id: roles }
    readonly property bool shown: folder.fileState === "invalid" || folder.fileState === "missing" || folder.restoreError !== "" || lockBanner.visible
    color: roles.panel
    implicitHeight: shown ? content.implicitHeight + Ui.Metrics.sm * 2 : 0
    visible: shown
    function escaped(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }
    function notice(title, body) {
        return "<b>" + escaped(title) + "</b><br>" + escaped(body)
    }
    ColumnLayout {
        id: content
        anchors.fill: parent
        anchors.margins: Ui.Metrics.sm
        spacing: Ui.Metrics.xs
        ProjectLockBanner {
            id: lockBanner
            Layout.fillWidth: true
            lock: root.folder.lock
        }
        Ui.Banner {
            objectName: "document-file-invalid"
            Layout.fillWidth: true
            visible: root.folder.fileState === "invalid"
            status: Ui.Status.Warning
            textFormat: Text.StyledText
            message: root.notice(qsTr("This file has an error"),
                                 qsTr("%1 was not loaded: %2. The last valid version stays open and still runs.").arg(root.folder.filePath, root.folder.fileError))
        }
        Ui.Banner {
            objectName: "document-file-missing"
            Layout.fillWidth: true
            visible: root.folder.fileState === "missing"
            status: Ui.Status.Warning
            textFormat: Text.StyledText
            message: root.notice(qsTr("File missing"),
                                 qsTr("%1 is no longer in the project folder. Restore writes it again from this document.").arg(root.folder.filePath))
            actionText: root.folder.busy ? "" : qsTr("Restore")
            onActionTriggered: root.folder.restoreFile()
        }
        Ui.Banner {
            objectName: "document-file-restore-error"
            Layout.fillWidth: true
            visible: root.folder.restoreError !== ""
            status: Ui.Status.Error
            message: root.folder.restoreError
        }
    }
}

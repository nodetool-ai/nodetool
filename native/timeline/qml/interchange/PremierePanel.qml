// Export to Premiere Pro and Import Premiere XML (issue 7085). The File menu
// items call openExport and openImport. src/interchange/PremiereTransfer.h
// does the work on a thread, so the editor stays live while a progress row and
// a Cancel button show at the top. src/interchange/PremierePanel.cpp registers
// this file in the overlay slot.
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "premierePanel"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    property alias controller: transferController
    readonly property bool exporting: transferController.mode === "export"
    readonly property string progressText: {
        if (transferController.phase === "packing")
            return "Packing the media for the import…";
        if (transferController.phase === "finishing")
            return "Saving the file…";
        if (transferController.mode === "import")
            return "Uploading the sequence and its media…";
        return "Exporting to Premiere Pro…";
    }
    readonly property string resultTitle: exporting ? "Export to Premiere Pro" : "Import Premiere XML"

    function openExport() {
        if (!transferController.available) {
            reasonDialog.open();
            return true;
        }
        if (transferController.running)
            return true;
        saveFile.currentFile = transferController.suggestedExportUrl();
        saveFile.open();
        return true;
    }
    function openImport() {
        if (!transferController.available) {
            reasonDialog.open();
            return true;
        }
        if (transferController.running)
            return true;
        openFile.open();
        return true;
    }

    PremiereTransfer {
        id: transferController
        objectName: "premiereTransfer"
        timeline: root.timelineModel
        onFinished: success => {
            if (success || transferController.error.length > 0)
                resultDialog.open();
        }
    }
    FileDialog {
        id: saveFile
        objectName: "premiereSaveDialog"
        title: "Export to Premiere Pro"
        fileMode: FileDialog.SaveFile
        nameFilters: ["Zip archive (*.zip)"]
        onAccepted: transferController.exportTo(selectedFile.toString())
    }
    FileDialog {
        id: openFile
        objectName: "premiereOpenDialog"
        title: "Import Premiere XML"
        fileMode: FileDialog.OpenFile
        nameFilters: ["Premiere sequence (*.xml *.zip)"]
        onAccepted: transferController.importFrom(selectedFile.toString())
    }

    Ui.Dialog {
        id: reasonDialog
        objectName: "premiereReasonDialog"
        title: "Open a server timeline first"
        modal: true
        width: Math.min(root.width || Ui.Metrics.dialogCompactWidth, Ui.Metrics.dialogCompactWidth)
        contentItem: Ui.Text {
            objectName: "premiereReason"
            text: transferController.unavailableReason
            wrapMode: Text.Wrap
            role: Ui.Typography.SansBody
        }
        footer: Row {
            spacing: Ui.Metrics.md
            padding: Ui.Metrics.lg
            layoutDirection: Qt.RightToLeft
            Ui.EditorButton {
                objectName: "premiereReasonClose"
                text: "Close"
                variant: Ui.EditorButton.Primary
                onClicked: reasonDialog.close()
            }
        }
    }

    Ui.Dialog {
        id: resultDialog
        objectName: "premiereResultDialog"
        title: root.resultTitle
        modal: true
        width: Math.min(root.width || Ui.Metrics.dialogWidth, Ui.Metrics.dialogWidth)
        height: Math.min(implicitHeight, root.height > 0 ? Math.max(0, root.height - 4 * Ui.Metrics.xl) : implicitHeight)
        closePolicy: Popup.CloseOnEscape
        onClosed: transferController.dismiss()
        contentItem: ScrollView {
            id: resultScroll
            clip: true
            implicitHeight: resultColumn.implicitHeight
            contentHeight: resultColumn.implicitHeight
            contentWidth: availableWidth
            ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
            Column {
                id: resultColumn
                width: resultScroll.availableWidth
                spacing: Ui.Metrics.md
                Ui.Status {
                    objectName: "premiereResultStatus"
                    width: parent.width
                    wrap: true
                    status: transferController.error.length > 0 ? Ui.Status.Error : transferController.notes.length > 0 || transferController.missingClips > 0 ? Ui.Status.Warning : Ui.Status.Success
                    message: {
                        if (transferController.error.length > 0)
                            return transferController.error;
                        if (root.exporting)
                            return transferController.clipsExported + (transferController.clipsExported === 1 ? " clip" : " clips") + " exported.";
                        return "Added \"" + transferController.importedName + "\" as a new timeline with " + transferController.importedClips + (transferController.importedClips === 1 ? " clip" : " clips") + " from " + transferController.importedMedia + (transferController.importedMedia === 1 ? " media file." : " media files.");
                    }
                }
                Ui.Text {
                    objectName: "premiereSavedPath"
                    visible: root.exporting && transferController.done
                    width: parent.width
                    wrapMode: Text.Wrap
                    text: "Saved to " + transferController.outputPath
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Text {
                    objectName: "premiereHowTo"
                    visible: root.exporting && transferController.done
                    width: parent.width
                    wrapMode: Text.Wrap
                    text: "Unzip it, keep the media folder next to the XML, then choose File > Import in Premiere Pro and pick the XML. If Premiere asks to link media, locate one file in the media folder and it links the rest."
                    role: Ui.Typography.SansBody
                }
                Ui.Text {
                    objectName: "premiereNotesTitle"
                    visible: transferController.notes.length > 0
                    width: parent.width
                    text: root.exporting ? "Left out or needs baking" : "Left out or changed"
                    role: Ui.Typography.SansLabel
                }
                Ui.Text {
                    objectName: "premiereNotesHint"
                    visible: root.exporting && transferController.notes.length > 0
                    width: parent.width
                    wrapMode: Text.Wrap
                    text: "Render these clips to video in NodeTool, or rebuild them in Premiere Pro."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Repeater {
                    model: transferController.notes
                    delegate: Ui.Text {
                        required property string modelData
                        objectName: "premiereNote"
                        width: resultColumn.width
                        wrapMode: Text.Wrap
                        text: modelData
                        role: Ui.Typography.SansBody
                    }
                }
                Ui.Text {
                    objectName: "premiereOmitted"
                    visible: transferController.omittedNotes > 0
                    width: parent.width
                    wrapMode: Text.Wrap
                    text: transferController.omittedNotes + (transferController.omittedNotes === 1 ? " more is" : " more are") + " listed in export-report.txt inside the zip."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Ui.Text {
                    objectName: "premiereNothingLeftOut"
                    visible: transferController.done && root.exporting && transferController.notes.length === 0
                    width: parent.width
                    wrapMode: Text.Wrap
                    text: "Nothing was left out."
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
            }
        }
        footer: Row {
            spacing: Ui.Metrics.md
            padding: Ui.Metrics.lg
            layoutDirection: Qt.RightToLeft
            Ui.EditorButton {
                objectName: "premiereResultClose"
                text: "Close"
                onClicked: resultDialog.close()
            }
            Ui.EditorButton {
                objectName: "premiereOpenImported"
                visible: !root.exporting && transferController.done
                text: "Open timeline"
                variant: Ui.EditorButton.Primary
                onClicked: {
                    transferController.openImported();
                    resultDialog.close();
                }
            }
            Ui.EditorButton {
                objectName: "premiereReveal"
                visible: root.exporting && transferController.done
                text: "Show in folder"
                variant: Ui.EditorButton.Primary
                onClicked: transferController.reveal(transferController.outputPath)
            }
        }
    }

    Rectangle {
        objectName: "premiereProgress"
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        visible: transferController.running
        implicitHeight: progressColumn.implicitHeight + Ui.Metrics.lg * 2
        height: implicitHeight
        color: Ui.Theme.surfacePanel
        ColumnLayout {
            id: progressColumn
            anchors.fill: parent
            anchors.margins: Ui.Metrics.lg
            spacing: Ui.Metrics.sm
            RowLayout {
                Layout.fillWidth: true
                Ui.Text {
                    objectName: "premiereProgressText"
                    Layout.fillWidth: true
                    role: Ui.Typography.SansLabel
                    text: root.progressText
                    wrapMode: Text.Wrap
                }
                Ui.Text {
                    visible: transferController.ratio >= 0
                    text: Math.round(transferController.ratio * 100) + "%"
                    role: Ui.Typography.MonoLabel
                    tone: Ui.Text.Secondary
                }
                Ui.BusyIndicator {
                    visible: transferController.ratio < 0
                    accessibleName: "Working"
                }
                Ui.EditorButton {
                    objectName: "premiereCancel"
                    text: "Cancel"
                    onClicked: transferController.cancel()
                }
            }
            Ui.Progress {
                Layout.fillWidth: true
                visible: transferController.ratio >= 0
                value: Math.max(0, transferController.ratio)
                accessibleName: "Premiere Pro transfer progress"
            }
        }
    }
}

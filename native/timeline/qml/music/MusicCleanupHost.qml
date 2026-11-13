// nt-panel: slot=overlay id=musicCleanup order=6 title="Music clean-up"
// Edit > Clean Up Unused Music Takes… (docs/MUSIC-MODE.md TK-5, MR10): lists
// the unused takes and context bounces with their size, and removes them
// after the person confirms. MusicCleanup does the work.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "musicCleanupHost"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    property var autosaveController: typeof autosave !== "undefined" ? autosave : null

    MusicCleanup {
        id: cleanup
        objectName: "musicCleanup"
        timeline: root.timelineModel
        autosave: root.autosaveController
    }

    function begin() {
        cleanup.reset()
        cleanup.scan()
        dialog.open()
        return true
    }
    function sizeText(bytes) {
        if (bytes < 0)
            return qsTr("size unknown")
        return qsTr("%1 MB").arg((bytes / 1048576).toFixed(1))
    }
    readonly property var rows: {
        const out = []
        for (const take of cleanup.takes)
            out.push({title: take.clipName + " · " + take.label, sizeBytes: take.sizeBytes, kept: take.kept, reason: take.reason})
        for (const context of cleanup.contexts)
            out.push({title: qsTr("Context: %1").arg(context.name), sizeBytes: context.sizeBytes, kept: context.kept, reason: context.reason})
        return out
    }
    readonly property bool working: cleanup.state === "scanning" || cleanup.state === "saving" || cleanup.state === "deleting"

    Ui.Dialog {
        id: dialog
        objectName: "musicCleanupDialog"
        title: qsTr("Clean up unused music takes")
        width: Math.min(Math.max(root.width - 2 * Ui.Metrics.dialogNarrowInset, 0), Ui.Metrics.dialogCompactWidth)
        onClosed: if (cleanup.state === "ready" || cleanup.state === "done" || cleanup.state === "failed") cleanup.reset()
        contentItem: ColumnLayout {
            spacing: Ui.Metrics.md
            RowLayout {
                visible: root.working
                spacing: Ui.Metrics.md
                Ui.BusyIndicator { running: root.working }
                Ui.Text {
                    Layout.fillWidth: true
                    wrapMode: Text.Wrap
                    text: cleanup.state === "scanning" ? qsTr("Reading the takes and their sizes from the server.")
                        : cleanup.state === "saving" ? qsTr("Waiting for the sequence to save before deleting audio.")
                        : qsTr("Deleting audio on the server.")
                }
            }
            Ui.Text {
                objectName: "musicCleanupSummary"
                Layout.fillWidth: true
                visible: cleanup.state === "ready" && cleanup.deleteCount > 0
                wrapMode: Text.Wrap
                text: qsTr("Removes %1 unused takes from their clips in one undo step, then deletes %2 audio files (%3) from the server once the sequence has saved.")
                    .arg(cleanup.removeCount).arg(cleanup.deleteCount).arg(root.sizeText(cleanup.deleteBytes))
            }
            Ui.Text {
                objectName: "musicCleanupWarning"
                Layout.fillWidth: true
                visible: cleanup.state === "ready" && cleanup.deleteCount > 0
                wrapMode: Text.Wrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Warning
                text: qsTr("Deleted audio cannot be restored. Undo puts the takes back on their clips, but they stay silent.")
            }
            ListView {
                id: list
                objectName: "musicCleanupList"
                Layout.fillWidth: true
                Layout.preferredHeight: Math.min(contentHeight, Ui.Metrics.touch * 6)
                visible: cleanup.state === "ready" && root.rows.length > 0
                clip: true
                model: root.rows
                ScrollBar.vertical: Ui.ScrollBar {}
                delegate: ColumnLayout {
                    id: row
                    required property var modelData
                    width: ListView.view.width
                    spacing: Ui.Metrics.micro
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: Ui.Metrics.md
                        Ui.Text {
                            Layout.fillWidth: true
                            text: row.modelData.title
                            tone: row.modelData.kept ? Ui.Text.Secondary : Ui.Text.Primary
                            elide: Text.ElideRight
                        }
                        Ui.Text {
                            text: root.sizeText(row.modelData.sizeBytes)
                            role: Ui.Typography.SansCaption
                            tone: Ui.Text.Secondary
                        }
                    }
                    Ui.Text {
                        Layout.fillWidth: true
                        visible: row.modelData.kept
                        text: qsTr("Kept. %1").arg(row.modelData.reason)
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        wrapMode: Text.Wrap
                    }
                }
            }
            Ui.Text {
                objectName: "musicCleanupMessage"
                Layout.fillWidth: true
                visible: cleanup.message !== "" && !root.working
                wrapMode: Text.Wrap
                tone: cleanup.state === "failed" ? Ui.Text.Error : Ui.Text.Primary
                text: cleanup.message
            }
        }
        footer: Row {
            spacing: Ui.Metrics.md
            padding: Ui.Metrics.lg
            layoutDirection: Qt.RightToLeft
            Ui.EditorButton {
                objectName: "musicCleanupConfirm"
                visible: cleanup.state === "ready" && cleanup.deleteCount > 0
                text: qsTr("Remove and delete")
                variant: Ui.EditorButton.Destructive
                onClicked: cleanup.confirm()
            }
            Ui.EditorButton {
                objectName: "musicCleanupClose"
                text: root.working || (cleanup.state === "ready" && cleanup.deleteCount > 0) ? qsTr("Cancel") : qsTr("Close")
                enabled: cleanup.state !== "deleting"
                onClicked: {
                    if (cleanup.state === "saving")
                        cleanup.reset()
                    dialog.close()
                }
            }
        }
    }
}

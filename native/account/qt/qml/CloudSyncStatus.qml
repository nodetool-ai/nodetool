import QtQuick
import NodeTool.UiPrimitives as Ui

// The synchronization status of an open cloud document (PRD "Two statuses",
// FR32): Saved to cloud, Sending, changes waiting with a count, Offline with
// the last connection, Cloud status unknown, Not saving, Unsent edits.
// A failed local write and refused edits read as errors, never as saved.
Ui.Status {
    id: root
    required property CloudDocument document
    readonly property int sync: root.document.syncStatus
    objectName: "cloud-sync-status"
    message: root.document.syncText
    status: sync === CloudDocument.SavedToCloud ? Ui.Status.Success
          : sync === CloudDocument.NotSaving || sync === CloudDocument.Unsent || sync === CloudDocument.NotOpened ? Ui.Status.Error
          : sync === CloudDocument.Offline || sync === CloudDocument.CloudStatusUnknown || sync === CloudDocument.SignedOut ? Ui.Status.Warning
          : Ui.Status.Info
}

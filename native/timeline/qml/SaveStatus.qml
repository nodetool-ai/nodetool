// Mirrors ui_primitives/SaveStatus.tsx and StatusBar.tsx SaveState: a dot
// and a caption for the save state of a server timeline. Saving shows a
// spinner. `autosave` is the AutosaveController (null for a local file:
// nothing is shown).
//   dirty   warning dot  "Unsaved changes"
//   saving  spinner      "Saving…"
//   saved   success dot  "Saved"
//   error   error dot    "Not saved" (a conflict, or a failed save)
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Row {
    id: status
    objectName: "saveStatus"
    property QtObject autosave: null
    // Under the compact width only the dot stays.
    property bool compact: false

    readonly property string state: autosave === null ? "idle"
        : autosave.saving ? "saving"
        : (autosave.conflict || autosave.lastError !== "") ? "error"
        : autosave.dirty ? "dirty" : "saved"
    readonly property string label: ({ dirty: "Unsaved changes", saving: "Saving…", saved: "Saved",
                                       error: "Not saved", idle: "" })[state]

    visible: state !== "idle"
    spacing: Ui.Metrics.xs
    Accessible.role: Accessible.StaticText
    Accessible.name: label

    Item {
        anchors.verticalCenter: parent.verticalCenter
        width: status.state === "saving" ? Ui.Metrics.iconXs : Ui.Metrics.md
        height: width
        Rectangle {
            objectName: "saveDot"
            visible: status.state !== "saving"
            anchors.fill: parent
            radius: Ui.Metrics.radiusPill
            color: status.state === "dirty" ? Ui.Theme.statusWarning : status.state === "error" ? Ui.Theme.statusError : Ui.Theme.statusSuccess
        }
        Ui.BusyIndicator {
            objectName: "saveSpinner"
            visible: status.state === "saving"
            anchors.fill: parent
            running: visible
            accessibleName: "Saving timeline"
        }
    }
    Ui.Text {
        objectName: "saveLabel"
        visible: !status.compact
        anchors.verticalCenter: parent.verticalCenter
        text: status.label
        tone: Ui.Text.Secondary
        role: Ui.Typography.SansCaption
    }
}

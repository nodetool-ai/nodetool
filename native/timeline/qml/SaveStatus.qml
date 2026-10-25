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
    spacing: Theme.spacingXs
    Accessible.role: Accessible.StaticText
    Accessible.name: label

    Item {
        anchors.verticalCenter: parent.verticalCenter
        width: status.state === "saving" ? 14 : 8
        height: width
        Rectangle {
            objectName: "saveDot"
            visible: status.state !== "saving"
            anchors.fill: parent
            radius: width / 2
            color: status.state === "dirty" ? Theme.warning : status.state === "error" ? Theme.error : Theme.success
        }
        Icon {
            objectName: "saveSpinner"
            visible: status.state === "saving"
            anchors.fill: parent
            size: 14
            stroke: true
            color: Theme.primary
            path: "M12 3 a9 9 0 1 1 -9 9"
            RotationAnimator on rotation {
                running: status.state === "saving"
                from: 0
                to: 360
                duration: 1000
                loops: Animation.Infinite
            }
        }
    }
    Text {
        objectName: "saveLabel"
        visible: !status.compact
        anchors.verticalCenter: parent.verticalCenter
        text: status.label
        color: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmaller
    }
}

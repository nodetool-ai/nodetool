// New music project (docs/MUSIC-MODE.md section 15, UI-1, MD9): tempo as a
// whole number from 30 to 300 BPM, one of 2/4, 3/4, 4/4 and 6/8, and an
// optional key. The host creates the sequence from `settings()` when the
// person confirms, and reports a server error through `error`.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "newMusicProjectDialog"
    property Item returnFocusTo: null
    property bool busy: false
    property string error: ""
    readonly property bool opened: dialog.visible
    property string signature: "4/4"
    property string keyTonic: ""
    property string keyMode: "major"
    readonly property string refusal: MusicProjectRules.refusal(settings())
    signal createRequested(var settings)
    signal cancelled()

    function settings() {
        const chosen = MusicProjectRules.signatures.find(entry => entry.value === signature) || {beatsPerBar: 4, beatUnit: 4}
        const bpm = bpmField.text.trim() === "" ? NaN : Number(bpmField.text)
        return {bpm: bpm, beatsPerBar: chosen.beatsPerBar, beatUnit: chosen.beatUnit, keyTonic: keyTonic, keyMode: keyMode}
    }
    function open() {
        error = ""
        bpmField.value = 120
        bpmField.text = "120"
        signature = "4/4"
        keyTonic = ""
        keyMode = "major"
        dialog.open()
    }
    function close() { dialog.close() }

    ProjectSettingsDialog.TimelineListDialog {
        id: dialog
        objectName: "newMusicProjectPopup"
        returnFocusTo: root.returnFocusTo
        title: qsTr("New music project")
        confirmText: qsTr("Create")
        confirmEnabled: root.refusal === ""
        busy: root.busy
        onConfirmed: root.createRequested(root.settings())
        onCancelled: { root.close(); root.cancelled() }
        content: Column {
            width: parent.width
            spacing: Ui.Metrics.lg
            Ui.Text {
                width: parent.width
                text: qsTr("Bars and the key apply to every generated take. The tempo cannot change once the project holds audio.")
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
            Row {
                width: parent.width
                spacing: Ui.Metrics.lg
                Column {
                    width: (parent.width - parent.spacing) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Tempo (BPM)"); role: Ui.Typography.SansLabel }
                    Ui.NumberField {
                        id: bpmField
                        objectName: "musicBpmField"
                        width: parent.width
                        density: Ui.EditorButton.Comfortable
                        from: 30
                        to: 300
                        value: 120
                        accessibleName: qsTr("Tempo in BPM")
                        errorText: qsTr("A whole number from 30 to 300")
                        valid: root.refusal === ""
                        inputMethodHints: Qt.ImhDigitsOnly
                        selectByMouse: true
                        onValueCommitted: value => bpmField.value = value
                    }
                }
                Column {
                    width: (parent.width - parent.spacing) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Time signature"); role: Ui.Typography.SansLabel }
                    Ui.Select {
                        objectName: "musicSignature"
                        width: parent.width
                        density: Ui.EditorButton.Comfortable
                        accessibleName: qsTr("Time signature")
                        options: MusicProjectRules.signatures
                        value: root.signature
                        onValueCommitted: value => root.signature = value
                    }
                }
            }
            Row {
                width: parent.width
                spacing: Ui.Metrics.lg
                Column {
                    width: (parent.width - parent.spacing) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Key"); role: Ui.Typography.SansLabel }
                    Ui.Select {
                        objectName: "musicKeyTonic"
                        width: parent.width
                        density: Ui.EditorButton.Comfortable
                        accessibleName: qsTr("Key")
                        options: MusicProjectRules.keyTonics
                        value: root.keyTonic
                        onValueCommitted: value => root.keyTonic = value
                    }
                }
                Column {
                    width: (parent.width - parent.spacing) / 2
                    spacing: Ui.Metrics.xs
                    Ui.Text { text: qsTr("Mode"); role: Ui.Typography.SansLabel }
                    Ui.Select {
                        objectName: "musicKeyMode"
                        width: parent.width
                        density: Ui.EditorButton.Comfortable
                        accessibleName: qsTr("Key mode")
                        enabled: root.keyTonic !== ""
                        options: MusicProjectRules.keyModes
                        value: root.keyMode
                        onValueCommitted: value => root.keyMode = value
                    }
                }
            }
            Ui.Text {
                objectName: "musicProjectRefusal"
                width: parent.width
                visible: text !== ""
                text: root.refusal !== "" ? root.refusal : root.error
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Error
            }
            Ui.Text {
                width: parent.width
                text: qsTr("The project starts with four audio tracks: Drums, Bass, Keyboard and Guitar.")
                wrapMode: Text.WordWrap
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
            }
        }
    }
}

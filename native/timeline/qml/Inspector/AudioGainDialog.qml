import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline

Dialog {
    id: root
    property TimelineModel timeline: null
    property var clipIds: []
    property string mode: "set"
    property string dbText: String(reader.audible[0]?.volumeDb ?? 0)
    property var openedGeneration: null
    readonly property bool valid: dbText.trim() !== "" && Number.isFinite(Number(dbText))
                                 && (mode === "adjust" || (Number(dbText) >= -120 && Number(dbText) <= 24))
    title: "Audio gain"
    modal: true
    focus: true
    closePolicy: Popup.CloseOnEscape
    width: Theme.trackHeaderWidth
    padding: Theme.spacingXl
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    onModeChanged: dbText = mode === "adjust" ? "0" : String(reader.audible[0]?.volumeDb ?? 0)
    onOpened: {
        openedGeneration = reader.generation
        dbText = mode === "adjust" ? "0" : String(reader.audible[0]?.volumeDb ?? 0)
        input.forceActiveFocus()
    }
    function confirm() {
        if (!valid || !timeline || reader.audible.length === 0) return
        if (openedGeneration !== null && openedGeneration !== reader.generation) return
        timeline.applyEdit("setClipsGain", {selectedIds: clipIds, db: Number(dbText), mode: mode})
        close()
    }
    ClipAudio { id: reader; timeline: root.timeline; selection: root.clipIds }
    background: Rectangle { color: Theme.backgroundPaper; border.color: Theme.divider; radius: Theme.radiusMd }
    contentItem: ColumnLayout {
        spacing: Theme.spacingLg
        Label { text: "Change"; color: Theme.textSecondary }
        RadioButton { text: "Set gain to"; checked: root.mode === "set"; onClicked: root.mode = "set" }
        RadioButton { text: "Adjust gain by"; checked: root.mode === "adjust"; onClicked: root.mode = "adjust" }
        Label { text: root.mode === "set" ? "Gain" : "Change"; color: Theme.textSecondary }
        RowLayout {
            TextField {
                id: input
                objectName: "gainInput"
                Layout.fillWidth: true
                text: root.dbText
                color: Theme.textPrimary
                selectByMouse: true
                Accessible.name: root.mode === "set" ? "Gain" : "Change"
                onTextEdited: root.dbText = text
                onAccepted: root.confirm()
                background: Rectangle { color: Theme.backgroundDefault; border.color: root.valid ? Theme.overlay : Theme.error; radius: Theme.radiusSm }
            }
            Label { text: "dB"; color: Theme.textSecondary }
        }
        Label { visible: !root.valid; text: "Enter a value from -120 to 24 dB."; color: Theme.error; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Label {
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            color: Theme.textSecondary
            text: reader.audible.length === 0 ? "None of the selected clips has sound."
                  : reader.audible.length === 1 ? "Applies to the selected clip."
                  : "Applies to " + reader.audible.length + " clips with sound."
        }
    }
    footer: DialogButtonBox {
        Button { text: "Cancel"; DialogButtonBox.buttonRole: DialogButtonBox.RejectRole }
        Button { text: "Apply"; enabled: root.valid && reader.audible.length > 0; onClicked: root.confirm() }
        onRejected: root.close()
    }
}

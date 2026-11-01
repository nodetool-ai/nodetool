import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Dialog {
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
    width: parent ? Math.min(Ui.Metrics.dialogCompactWidth, parent.width - 2 * Ui.Metrics.dialogNarrowInset) : Ui.Metrics.dialogCompactWidth
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
    contentItem: ColumnLayout {
        spacing: Ui.Metrics.lg
        Ui.Text { objectName: "gainChangeLabel"; text: "Change"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
        Ui.Select {
            objectName: "gainChangeMode"
            Layout.fillWidth: true
            accessibleName: "Gain change"
            options: [{label: "Set gain to", value: "set"}, {label: "Adjust gain by", value: "adjust"}]
            value: root.mode
            onValueCommitted: value => root.mode = value
        }
        Ui.Text { objectName: "gainValueLabel"; text: root.mode === "set" ? "Gain" : "Change"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
        RowLayout {
            Ui.TextField {
                id: input
                objectName: "gainInput"
                Layout.fillWidth: true
                value: root.dbText
                suffix: "dB"
                valid: root.valid
                errorText: "Enter a value from -120 to 24 dB."
                selectByMouse: true
                accessibleName: root.mode === "set" ? "Gain" : "Change"
                onValuePreviewed: value => root.dbText = value
                onAccepted: root.confirm()
            }
        }
        Ui.Text { objectName: "gainRangeError"; visible: !root.valid; text: "Enter a value from -120 to 24 dB."; role: Ui.Typography.SansCaption; tone: Ui.Text.Error; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Ui.Text {
            objectName: "gainScope"
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            text: reader.audible.length === 0 ? "None of the selected clips has sound."
                  : reader.audible.length === 1 ? "Applies to the selected clip."
                  : "Applies to " + reader.audible.length + " clips with sound."
        }
    }
    footer: Row {
        spacing: Ui.Metrics.md
        Ui.EditorButton { objectName: "gainCancel"; text: "Cancel"; onClicked: root.close() }
        Ui.EditorButton { objectName: "gainApply"; text: "Apply"; variant: Ui.EditorButton.Primary; enabled: root.valid && reader.audible.length > 0; onClicked: root.confirm() }
    }
}

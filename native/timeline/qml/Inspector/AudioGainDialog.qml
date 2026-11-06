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
    property string dbText: defaultText(mode)
    property var openedGeneration: null
    // Normalize modes measure the clips first. The value is then a target, not a gain.
    readonly property bool normalizing: mode === "loudness" || mode === "peak"
    readonly property AudioRoles roles: timeline ? AudioRolesRegistry.forTimeline(timeline) : null
    readonly property bool measuring: roles ? roles.busy && roles.task === "normalize" : false
    readonly property string rangeText: normalizing ? "Enter a value from -60 to 0." : "Enter a value from -120 to 24 dB."
    readonly property bool valid: dbText.trim() !== "" && Number.isFinite(Number(dbText))
                                 && (mode === "adjust" || (normalizing ? Number(dbText) >= -60 && Number(dbText) <= 0
                                                                       : Number(dbText) >= -120 && Number(dbText) <= 24))
    title: "Audio gain"
    modal: true
    focus: true
    closePolicy: Popup.CloseOnEscape
    width: parent ? Math.min(Ui.Metrics.dialogCompactWidth, parent.width - 2 * Ui.Metrics.dialogNarrowInset) : Ui.Metrics.dialogCompactWidth
    function defaultText(kind) {
        if (kind === "adjust") return "0"
        if (kind === "peak") return "-1"
        if (kind === "loudness") {
            // The first clip's role names the target a person most likely wants.
            const role = roles && reader.audible.length > 0 ? roles.roleOf(reader.audible[0].id) : ""
            return String(role !== "" && roles ? roles.targets[role] : -23)
        }
        return String(reader.audible[0]?.volumeDb ?? 0)
    }
    onModeChanged: dbText = defaultText(mode)
    onOpened: {
        openedGeneration = reader.generation
        dbText = defaultText(mode)
        input.forceActiveFocus()
    }
    function confirm() {
        if (!valid || !timeline || reader.audible.length === 0 || measuring) return
        if (openedGeneration !== null && openedGeneration !== reader.generation) return
        if (normalizing) {
            // The dialog stays open with a progress bar and closes when the measurement is applied.
            roles.normalize(clipIds, mode, Number(dbText))
            return
        }
        timeline.applyEdit("setClipsGain", {selectedIds: clipIds, db: Number(dbText), mode: mode})
        close()
    }
    onClosed: if (measuring) roles.cancel()
    Connections {
        target: root.roles
        function onFinished(task, applied) {
            if (task === "normalize" && applied && root.opened) root.close()
        }
    }
    ClipAudio { id: reader; timeline: root.timeline; selection: root.clipIds }
    contentItem: ColumnLayout {
        spacing: Ui.Metrics.lg
        Ui.Text { objectName: "gainChangeLabel"; text: "Change"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
        Ui.Select {
            objectName: "gainChangeMode"
            Layout.fillWidth: true
            accessibleName: "Gain change"
            enabled: !root.measuring
            options: [{label: "Set gain to", value: "set"}, {label: "Adjust gain by", value: "adjust"},
                      {label: "Normalize loudness to", value: "loudness"}, {label: "Normalize peak to", value: "peak"}]
            value: root.mode
            onValueCommitted: value => root.mode = value
        }
        Ui.Text { objectName: "gainValueLabel"; text: root.mode === "set" ? "Gain" : root.normalizing ? "Target" : "Change"; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary }
        RowLayout {
            Ui.TextField {
                id: input
                objectName: "gainInput"
                Layout.fillWidth: true
                value: root.dbText
                suffix: root.mode === "loudness" ? "LUFS" : root.mode === "peak" ? "dBFS" : "dB"
                valid: root.valid
                errorText: root.rangeText
                enabled: !root.measuring
                selectByMouse: true
                accessibleName: root.mode === "set" ? "Gain" : root.normalizing ? "Target" : "Change"
                onValuePreviewed: value => root.dbText = value
                onAccepted: root.confirm()
            }
        }
        Ui.Text { objectName: "gainRangeError"; visible: !root.valid; text: root.rangeText; role: Ui.Typography.SansCaption; tone: Ui.Text.Error; wrapMode: Text.Wrap; Layout.fillWidth: true }
        Ui.Text {
            objectName: "gainScope"
            Layout.fillWidth: true
            wrapMode: Text.Wrap
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            text: reader.audible.length === 0 ? "None of the selected clips has sound."
                  : root.normalizing ? (reader.audible.length === 1 ? "Measures the selected clip, then sets its volume."
                                        : "Measures each of the " + reader.audible.length + " clips on its own, then sets its volume.")
                  : reader.audible.length === 1 ? "Applies to the selected clip."
                  : "Applies to " + reader.audible.length + " clips with sound."
        }
        RowLayout {
            objectName: "gainMeasuring"
            Layout.fillWidth: true
            visible: root.measuring
            spacing: Ui.Metrics.md
            Ui.Progress { Layout.fillWidth: true; accessibleName: "Measuring"; value: root.roles ? root.roles.progress : 0 }
            Ui.Text { text: "Measuring..."; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        }
        Ui.Text {
            objectName: "gainMeasureError"
            Layout.fillWidth: true
            visible: !root.measuring && !!root.roles && root.roles.messageIsError && root.normalizing
            wrapMode: Text.Wrap
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Error
            text: root.roles ? root.roles.message : ""
        }
    }
    footer: Row {
        spacing: Ui.Metrics.md
        Ui.EditorButton { objectName: "gainCancel"; text: "Cancel"; onClicked: root.close() }
        Ui.EditorButton { objectName: "gainApply"; text: root.normalizing ? "Normalize" : "Apply"; variant: Ui.EditorButton.Primary; enabled: root.valid && reader.audible.length > 0 && !root.measuring; onClicked: root.confirm() }
    }
}

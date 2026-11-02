import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "loudnessFormat.js" as Format

// Momentary, short-term and integrated loudness and true peak of the mix, as the audio device plays it.
// Nothing here changes the document, and a stopped transport only leaves the last readings in place.
Item {
    id: root
    objectName: "loudnessMeter"
    property string standardId: "broadcast"
    readonly property var standard: Format.standard(standardId)
    property var reading: ({available: false, active: false, momentary: -Infinity, shortTerm: -Infinity,
                            integrated: -Infinity, truePeakDb: -Infinity})
    readonly property bool measured: reading.available && isFinite(reading.integrated)
    readonly property var loudnessJudgement: Format.judgeLoudness(reading.integrated, standard.lufs)
    readonly property var peakJudgement: Format.judgePeak(reading.truePeakDb, standard.peak)
    implicitHeight: column.implicitHeight
    implicitWidth: column.implicitWidth

    function toneOf(judgement) {
        return judgement.status === "ok" ? Ui.Text.Success : judgement.status === "near" ? Ui.Text.Warning
             : judgement.status === "off" ? Ui.Text.Error : Ui.Text.Primary
    }
    function poll() { reading = LoudnessMeters.read() }
    Timer {
        interval: 100
        running: root.visible
        repeat: true
        triggeredOnStart: true
        onTriggered: root.poll()
    }
    // One reading: a caption over the value and its unit. Two of them share a row, half the width each.
    component Readout: Column {
        id: readout
        property string label: ""
        property string value: "--"
        property string unit: "LUFS"
        property int tone: Ui.Text.Primary
        property string objectKey: ""
        spacing: 0
        Ui.Text { text: readout.label; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        Row {
            spacing: Ui.Metrics.xs
            Ui.Text { objectName: "meterValue-" + readout.objectKey; text: readout.value; role: Ui.Typography.MonoStrong; tone: readout.tone }
            Ui.Text { text: readout.unit; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        }
    }
    ColumnLayout {
        id: column
        anchors.left: parent.left
        anchors.right: parent.right
        spacing: Ui.Metrics.md
        Row {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Readout { width: (parent.width - parent.spacing) / 2; label: "Momentary"; objectKey: "momentary"; value: Format.level(root.reading.momentary) }
            Readout { width: (parent.width - parent.spacing) / 2; label: "Short-term"; objectKey: "shortTerm"; value: Format.level(root.reading.shortTerm) }
        }
        Row {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md
            Readout {
                width: (parent.width - parent.spacing) / 2
                label: "Integrated"; objectKey: "integrated"; value: Format.level(root.reading.integrated)
                tone: root.toneOf(root.loudnessJudgement)
            }
            Readout {
                width: (parent.width - parent.spacing) / 2
                label: "True peak"; objectKey: "truePeak"; unit: "dBTP"; value: Format.level(root.reading.truePeakDb)
                tone: root.toneOf(root.peakJudgement)
            }
        }
        Ui.Status {
            objectName: "meterVerdict"
            Layout.fillWidth: true
            visible: root.measured && (root.loudnessJudgement.status !== "none" || root.peakJudgement.status === "off")
            wrap: true
            status: root.peakJudgement.status === "off" || root.loudnessJudgement.status === "off" ? Ui.Status.Error
                  : root.loudnessJudgement.status === "near" ? Ui.Status.Warning : Ui.Status.Success
            message: root.peakJudgement.status === "off" ? root.peakJudgement.text
                   : root.loudnessJudgement.text
        }
        Ui.Text {
            objectName: "meterIdle"
            Layout.fillWidth: true
            visible: !root.reading.available
            wrapMode: Text.Wrap
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            text: "The meter reads the sound that plays. Press play to measure."
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm
            Ui.Select {
                objectName: "meterStandard"
                Layout.fillWidth: true
                accessibleName: "Delivery standard"
                density: Ui.EditorButton.Compact
                options: Format.standards.map(item => ({label: item.label, value: item.value}))
                value: root.standardId
                onValueCommitted: value => root.standardId = value
            }
            Ui.EditorButton {
                objectName: "meterReset"
                text: "Reset"
                density: Ui.EditorButton.Compact
                accessibleName: "Reset the loudness meter"
                enabled: root.reading.available
                onClicked: { LoudnessMeters.reset(); root.poll() }
            }
        }
    }
}

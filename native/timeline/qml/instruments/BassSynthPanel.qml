// Compact analog bass synth panel for the timeline (preset, wave, sub, cutoff,
// resonance, env amount, decay, accent, glide). Built exclusively with
// NodeTool.UiPrimitives per native/ui_primitives/DESIGN.md.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: root
    variant: Ui.Surface.Panel
    objectName: "bassSynthPanel"

    property TimelineModel timeline: null
    property string trackId: ""
    property bool readOnly: false
    property var instrument: ({})

    signal presetSelected(string presetId)
    signal parameterCommitted(string name, var value)

    readonly property var activeInstrument: {
        if (root.timeline && root.trackId !== "") {
            const tracks = root.timeline.tracksJson
            if (tracks) {
                for (let i = 0; i < tracks.length; ++i) {
                    if (tracks[i].id === root.trackId && tracks[i].instrument) {
                        return tracks[i].instrument
                    }
                }
            }
        }
        return root.instrument || ({})
    }

    readonly property string presetValue: activeInstrument.preset ? String(activeInstrument.preset) : ""
    readonly property var presetOptions: root.presetValue === ""
        ? [{ value: "", label: qsTr("Custom"), enabled: false }].concat(BassSynthCatalog.presets)
        : BassSynthCatalog.presets
    readonly property string waveValue: activeInstrument.waveform ? String(activeInstrument.waveform) : "saw"
    readonly property real subLevelValue: numOr(activeInstrument.subLevel, 0.55)
    readonly property real cutoffHzValue: numOr(activeInstrument.cutoffHz, 340.0)
    readonly property real resonanceValue: numOr(activeInstrument.resonance, 0.62)
    readonly property real envAmountValue: numOr(activeInstrument.filterEnvAmount, 2.8)
    readonly property real decayMsValue: numOr(activeInstrument.filterDecayMs, 180.0)
    readonly property real accentValue: numOr(activeInstrument.accentAmount, 0.70)
    readonly property real glideMsValue: numOr(activeInstrument.slideMs, 60.0)
    readonly property real pulseWidthValue: numOr(activeInstrument.pulseWidth, 0.50)
    readonly property bool hardSyncValue: activeInstrument.hardSync === true
    readonly property bool retriggerValue: activeInstrument.retrigger === true

    implicitWidth: Ui.Metrics.xxxl * 11
    implicitHeight: contentColumn.implicitHeight + Ui.Metrics.md * 2

    function numOr(v, fallback) {
        const n = Number(v)
        return Number.isFinite(n) ? n : fallback
    }

    function toLogNorm(val, minVal, maxVal) {
        const clamped = Math.max(minVal, Math.min(maxVal, val))
        return Math.log(clamped / minVal) / Math.log(maxVal / minVal)
    }

    function fromLogNorm(norm, minVal, maxVal) {
        const t = Math.max(0.0, Math.min(1.0, norm))
        return minVal * Math.pow(maxVal / minVal, t)
    }

    function formatHz(hz) {
        return hz >= 1000.0 ? (hz / 1000.0).toFixed(2) + " kHz" : Math.round(hz) + " Hz"
    }

    function formatMs(ms) {
        return ms >= 1000.0 ? (ms / 1000.0).toFixed(2) + " s" : Math.round(ms) + " ms"
    }

    function formatPct(v) {
        return Math.round(v * 100.0) + "%"
    }

    function formatOct(v) {
        return (v >= 0 ? "+" : "") + v.toFixed(1) + " oct"
    }

    function commitPreset(presetId) {
        if (root.readOnly || !presetId) return
        root.presetSelected(presetId)
        if (root.timeline && root.trackId !== "") {
            root.timeline.applyEdit("bass.setPreset", { trackId: root.trackId, preset: presetId })
        }
    }

    function commitParam(name, value) {
        if (root.readOnly) return
        root.parameterCommitted(name, value)
        if (root.timeline && root.trackId !== "") {
            const payload = { trackId: root.trackId }
            payload[name] = value
            root.timeline.applyEdit("bass.setParams", payload)
        }
    }

    component ParamSliderRow: RowLayout {
        id: row
        required property string labelText
        required property string readoutText
        required property real sliderValue
        property real from: 0.0
        property real to: 1.0
        property real resetValue: 0.0
        property string sliderName: ""
        property bool controlEnabled: !root.readOnly
        signal committed(real nextValue)

        Layout.fillWidth: true
        spacing: Ui.Metrics.sm

        Ui.Text {
            Layout.preferredWidth: Ui.Metrics.xxxl * 2
            role: Ui.Typography.SansCaption
            tone: row.controlEnabled ? Ui.Text.Secondary : Ui.Text.Disabled
            text: row.labelText
            elide: Text.ElideRight
        }

        Ui.Slider {
            objectName: row.sliderName
            Layout.fillWidth: true
            density: Ui.EditorButton.Compact
            enabled: row.controlEnabled
            from: row.from
            to: row.to
            value: row.sliderValue
            resetValue: row.resetValue
            resetOnDoubleTap: true
            accessibleName: row.labelText
            onValueCommitted: v => row.committed(v)
        }

        Ui.Text {
            Layout.preferredWidth: Ui.Metrics.xxxl * 2
            role: Ui.Typography.MonoCaption
            tone: row.controlEnabled ? Ui.Text.Primary : Ui.Text.Disabled
            horizontalAlignment: Text.AlignRight
            text: row.readoutText
        }
    }

    ColumnLayout {
        id: contentColumn
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm

        Ui.PanelHeader {
            Layout.fillWidth: true
            text: qsTr("Analog Bass")
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm

            Ui.Select {
                id: presetSelect
                objectName: "bassPresetSelect"
                Layout.fillWidth: true
                density: Ui.EditorButton.Compact
                enabled: !root.readOnly
                accessibleName: qsTr("Bass preset")
                options: root.presetOptions
                value: root.presetValue
                onValueCommitted: v => root.commitPreset(String(v))
            }

            Ui.SegmentedControl {
                id: waveControl
                objectName: "bassWaveControl"
                density: Ui.EditorButton.Compact
                variant: Ui.SegmentedControl.Tray
                enabled: !root.readOnly
                accessibleName: qsTr("Oscillator waveform")
                optionNamePrefix: "bassWave_"
                options: BassSynthCatalog.waveforms
                value: root.waveValue
                onValueCommitted: v => root.commitParam("waveform", String(v))
            }
        }

        Ui.Separator {
            Layout.fillWidth: true
        }

        ParamSliderRow {
            sliderName: "bassSubSlider"
            labelText: qsTr("Sub")
            sliderValue: root.subLevelValue
            resetValue: 0.55
            readoutText: root.formatPct(root.subLevelValue)
            onCommitted: v => root.commitParam("subLevel", v)
        }

        ParamSliderRow {
            sliderName: "bassCutoffSlider"
            labelText: qsTr("Cutoff")
            sliderValue: root.toLogNorm(root.cutoffHzValue, 20.0, 18000.0)
            resetValue: root.toLogNorm(340.0, 20.0, 18000.0)
            readoutText: root.formatHz(root.cutoffHzValue)
            onCommitted: v => root.commitParam("cutoffHz", root.fromLogNorm(v, 20.0, 18000.0))
        }

        ParamSliderRow {
            sliderName: "bassResonanceSlider"
            labelText: qsTr("Resonance")
            sliderValue: root.resonanceValue
            resetValue: 0.62
            readoutText: root.formatPct(root.resonanceValue)
            onCommitted: v => root.commitParam("resonance", v)
        }

        ParamSliderRow {
            sliderName: "bassEnvAmountSlider"
            labelText: qsTr("Env Amt")
            from: -5.0
            to: 5.0
            sliderValue: root.envAmountValue
            resetValue: 2.8
            readoutText: root.formatOct(root.envAmountValue)
            onCommitted: v => root.commitParam("filterEnvAmount", v)
        }

        ParamSliderRow {
            sliderName: "bassDecaySlider"
            labelText: qsTr("Decay")
            sliderValue: root.toLogNorm(root.decayMsValue, 5.0, 4000.0)
            resetValue: root.toLogNorm(180.0, 5.0, 4000.0)
            readoutText: root.formatMs(root.decayMsValue)
            onCommitted: v => root.commitParam("filterDecayMs", root.fromLogNorm(v, 5.0, 4000.0))
        }

        ParamSliderRow {
            sliderName: "bassAccentSlider"
            labelText: qsTr("Accent")
            sliderValue: root.accentValue
            resetValue: 0.70
            readoutText: root.formatPct(root.accentValue)
            onCommitted: v => root.commitParam("accentAmount", v)
        }

        ParamSliderRow {
            sliderName: "bassGlideSlider"
            labelText: qsTr("Glide")
            from: 0.0
            to: 500.0
            sliderValue: root.glideMsValue
            resetValue: 60.0
            readoutText: root.formatMs(root.glideMsValue)
            onCommitted: v => root.commitParam("slideMs", v)
        }

        ParamSliderRow {
            visible: root.waveValue === "square"
            sliderName: "bassPulseWidthSlider"
            labelText: qsTr("Pulse Width")
            from: 0.05
            to: 0.95
            sliderValue: root.pulseWidthValue
            resetValue: 0.50
            readoutText: root.formatPct(root.pulseWidthValue)
            onCommitted: v => root.commitParam("pulseWidth", v)
        }

        Ui.Separator {
            Layout.fillWidth: true
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md

            Ui.Toggle {
                objectName: "bassHardSyncToggle"
                text: qsTr("Hard Sync")
                enabled: !root.readOnly
                checked: root.hardSyncValue
                onCheckedChangedByUser: checked => root.commitParam("hardSync", checked)
            }

            Ui.Toggle {
                objectName: "bassRetriggerToggle"
                text: qsTr("Retrigger")
                enabled: !root.readOnly
                checked: root.retriggerValue
                onCheckedChangedByUser: checked => root.commitParam("retrigger", checked)
            }

            Item { Layout.fillWidth: true }
        }
    }
}

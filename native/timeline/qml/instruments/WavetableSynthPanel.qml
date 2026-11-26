// Compact WT-1 wavetable synth panel for the timeline (preset picker, osc A/B
// wavetable & position knobs, filter cutoff/resonance, amp ADSR, unison).
// Built with NodeTool.UiPrimitives per native/ui_primitives/DESIGN.md.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../fx"
import "../fx/FxParams.js" as FxParams

Ui.Surface {
    id: root
    variant: Ui.Surface.Panel
    objectName: "wavetableSynthPanel"

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

    readonly property var oscAObj: activeInstrument.oscA || ({})
    readonly property var oscBObj: activeInstrument.oscB || ({})
    readonly property var ampEnvObj: activeInstrument.ampEnv || ({})

    readonly property string presetValue: activeInstrument.preset ? String(activeInstrument.preset) : "wt1-init"
    readonly property string oscATableValue: oscAObj.table ? String(oscAObj.table) : "prime"
    readonly property real oscAPosValue: numOr(oscAObj.position, 0.0)
    readonly property int oscAUnisonValue: Math.max(1, Math.min(7, Math.round(numOr(oscAObj.unison, 1))))
    readonly property real oscADetuneValue: numOr(oscAObj.detune, 0.2)
    readonly property real oscASpreadValue: numOr(oscAObj.spread, 0.6)

    readonly property bool oscBOnValue: oscBObj.on === true
    readonly property string oscBTableValue: oscBObj.table ? String(oscBObj.table) : "bloom"
    readonly property real oscBPosValue: numOr(oscBObj.position, 0.0)

    readonly property string filterTypeValue: activeInstrument.filterType ? String(activeInstrument.filterType) : "lp24"
    readonly property real cutoffHzValue: numOr(activeInstrument.cutoffHz, 9000.0)
    readonly property real resonanceValue: numOr(activeInstrument.resonance, 0.18)

    readonly property real ampAttackMsValue: numOr(ampEnvObj.attackMs, 4.0)
    readonly property real ampDecayMsValue: numOr(ampEnvObj.decayMs, 250.0)
    readonly property real ampSustainValue: numOr(ampEnvObj.sustain, 0.8)
    readonly property real ampReleaseMsValue: numOr(ampEnvObj.releaseMs, 300.0)

    implicitWidth: Ui.Metrics.xxxl * 12
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

    function commitPreset(presetId) {
        if (root.readOnly || !presetId) return
        root.presetSelected(presetId)
        if (root.timeline && root.trackId !== "") {
            root.timeline.applyEdit("wavetable.setPreset", { trackId: root.trackId, preset: presetId })
        }
    }

    AutomationController { id: live; timeline: root.timeline; trackId: root.trackId }
    function previewParam(name, value) {
        if (readOnly) return
        const patch = {}; patch[name] = value
        live.previewDevice("instrument", patch)
    }
    function cancelPreview() { live.cancelDevice("instrument") }
    onVisibleChanged: if (!visible) cancelPreview()

    function commitParam(name, value) {
        if (root.readOnly) return
        root.parameterCommitted(name, value)
        if (root.timeline && root.trackId !== "") {
            const payload = { trackId: root.trackId }
            payload[name] = value
            live.commitDevice("instrument", { [name]: value }, "wavetable.setParams", payload)
        }
    }

    component ParamSliderRow: RowLayout {
        id: row
        required property string labelText
        required property string readoutText
        required property real sliderValue
        property real from: 0.0
        property real to: 1.0
        property real stepSize: 0.0
        property real resetValue: 0.0
        property string sliderName: ""
        property bool controlEnabled: !root.readOnly
        signal previewed(real nextValue)
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
            stepSize: row.stepSize
            value: row.sliderValue
            resetValue: row.resetValue
            resetOnDoubleTap: true
            accessibleName: row.labelText
            cancelOnFocusLoss: true
            onValuePreviewed: v => row.previewed(v)
            onEditCanceled: root.cancelPreview()
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

    component OscPosKnob: FxKnob {
        cancelOnFocusLoss: true
        id: knob
        required property real boundValue
        required property string paramName
        property real draftValue: boundValue
        property bool hasDraft: false

        size: "sm"
        value: hasDraft ? draftValue : boundValue
        onBoundValueChanged: {
            if (!dragging && !editing) {
                hasDraft = false
                draftValue = boundValue
            }
        }
        onChange: v => {
            draftValue = v
            hasDraft = true
            root.previewParam(paramName, v)
        }
        onGestureEnd: {
            if (hasDraft) {
                hasDraft = false
                root.commitParam(paramName, draftValue)
            }
        }
        onGestureCanceled: {
            root.cancelPreview()
            hasDraft = false
            draftValue = boundValue
        }
        onSetValue: v => {
            hasDraft = false
            draftValue = v
            root.commitParam(paramName, v)
        }
    }

    ColumnLayout {
        id: contentColumn
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.sm

        Ui.PanelHeader {
            Layout.fillWidth: true
            text: qsTr("Wavetable Synth")
        }

        Ui.Select {
            id: presetSelect
            objectName: "wtPresetSelect"
            Layout.fillWidth: true
            density: Ui.EditorButton.Compact
            enabled: !root.readOnly
            accessibleName: qsTr("Wavetable preset")
            options: WavetableCatalog.presets
            value: root.presetValue
            onValueCommitted: v => root.commitPreset(String(v))
        }

        Ui.Separator {
            Layout.fillWidth: true
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.md

            ColumnLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs

                Ui.Text {
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    text: qsTr("Osc A")
                }

                Ui.Select {
                    objectName: "wtOscATableSelect"
                    Layout.fillWidth: true
                    density: Ui.EditorButton.Compact
                    enabled: !root.readOnly
                    accessibleName: qsTr("Oscillator A table")
                    options: WavetableCatalog.tables
                    value: root.oscATableValue
                    onValueCommitted: v => root.commitParam("oscATable", String(v))
                }

                OscPosKnob {
                    objectName: "wtOscAPosKnob"
                    Layout.alignment: Qt.AlignHCenter
                    accent: "a"
                    enabled: !root.readOnly
                    paramName: "oscAPosition"
                    boundValue: root.oscAPosValue
                    def: ({ id: "oscAPosition", label: qsTr("Pos A"), min: 0.0, max: 1.0, def: 0.0, fmt: FxParams.fmtPct })
                }
            }

            Ui.Separator {
                orientation: Qt.Vertical
                Layout.fillHeight: true
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs

                RowLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs

                    Ui.Text {
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        text: qsTr("Osc B")
                    }

                    Item { Layout.fillWidth: true }

                    Ui.Toggle {
                        objectName: "wtOscBOnToggle"
                        text: qsTr("On")
                        enabled: !root.readOnly
                        checked: root.oscBOnValue
                        onCheckedChangedByUser: checked => root.commitParam("oscBOn", checked)
                    }
                }

                Ui.Select {
                    objectName: "wtOscBTableSelect"
                    Layout.fillWidth: true
                    density: Ui.EditorButton.Compact
                    enabled: !root.readOnly && root.oscBOnValue
                    accessibleName: qsTr("Oscillator B table")
                    options: WavetableCatalog.tables
                    value: root.oscBTableValue
                    onValueCommitted: v => root.commitParam("oscBTable", String(v))
                }

                OscPosKnob {
                    objectName: "wtOscBPosKnob"
                    Layout.alignment: Qt.AlignHCenter
                    accent: "b"
                    enabled: !root.readOnly && root.oscBOnValue
                    paramName: "oscBPosition"
                    boundValue: root.oscBPosValue
                    def: ({ id: "oscBPosition", label: qsTr("Pos B"), min: 0.0, max: 1.0, def: 0.0, fmt: FxParams.fmtPct })
                }
            }
        }

        Ui.Separator {
            Layout.fillWidth: true
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm

            Ui.Text {
                Layout.preferredWidth: Ui.Metrics.xxxl * 2
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                text: qsTr("Filter")
            }

            Ui.Select {
                objectName: "wtFilterTypeSelect"
                Layout.fillWidth: true
                density: Ui.EditorButton.Compact
                enabled: !root.readOnly
                accessibleName: qsTr("Filter type")
                options: WavetableCatalog.filterTypes
                value: root.filterTypeValue
                onValueCommitted: v => root.commitParam("filterType", String(v))
            }
        }

        ParamSliderRow {
            sliderName: "wtCutoffSlider"
            labelText: qsTr("Cutoff")
            controlEnabled: !root.readOnly && root.filterTypeValue !== "none"
            sliderValue: root.toLogNorm(root.cutoffHzValue, 20.0, 20000.0)
            resetValue: root.toLogNorm(9000.0, 20.0, 20000.0)
            readoutText: root.formatHz(root.cutoffHzValue)
            onPreviewed: v => root.previewParam("cutoffHz", root.fromLogNorm(v, 20.0, 20000.0))
            onCommitted: v => root.commitParam("cutoffHz", root.fromLogNorm(v, 20.0, 20000.0))
        }

        ParamSliderRow {
            sliderName: "wtResonanceSlider"
            labelText: qsTr("Resonance")
            controlEnabled: !root.readOnly && root.filterTypeValue !== "none"
            from: 0.0
            to: 0.99
            sliderValue: root.resonanceValue
            resetValue: 0.18
            readoutText: root.formatPct(root.resonanceValue)
            onPreviewed: v => root.previewParam("resonance", v)
            onCommitted: v => root.commitParam("resonance", v)
        }

        Ui.Separator {
            Layout.fillWidth: true
        }

        ParamSliderRow {
            sliderName: "wtUnisonSlider"
            labelText: qsTr("Unison")
            from: 1.0
            to: 7.0
            stepSize: 1.0
            sliderValue: root.oscAUnisonValue
            resetValue: 1.0
            readoutText: root.oscAUnisonValue + "v"
            onPreviewed: v => root.previewParam("oscAUnison", Math.round(v))
            onCommitted: v => root.commitParam("oscAUnison", Math.round(v))
        }

        ParamSliderRow {
            sliderName: "wtDetuneSlider"
            labelText: qsTr("Detune")
            controlEnabled: !root.readOnly && root.oscAUnisonValue > 1
            sliderValue: root.oscADetuneValue
            resetValue: 0.2
            readoutText: root.formatPct(root.oscADetuneValue)
            onPreviewed: v => root.previewParam("oscADetune", v)
            onCommitted: v => root.commitParam("oscADetune", v)
        }

        ParamSliderRow {
            sliderName: "wtSpreadSlider"
            labelText: qsTr("Spread")
            controlEnabled: !root.readOnly && root.oscAUnisonValue > 1
            sliderValue: root.oscASpreadValue
            resetValue: 0.6
            readoutText: root.formatPct(root.oscASpreadValue)
            onPreviewed: v => root.previewParam("oscASpread", v)
            onCommitted: v => root.commitParam("oscASpread", v)
        }

        Ui.Separator {
            Layout.fillWidth: true
        }

        ParamSliderRow {
            sliderName: "wtAttackSlider"
            labelText: qsTr("Attack")
            sliderValue: root.toLogNorm(root.ampAttackMsValue, 1.0, 8000.0)
            resetValue: root.toLogNorm(4.0, 1.0, 8000.0)
            readoutText: root.formatMs(root.ampAttackMsValue)
            onPreviewed: v => root.previewParam("ampAttackMs", root.fromLogNorm(v, 1.0, 8000.0))
            onCommitted: v => root.commitParam("ampAttackMs", root.fromLogNorm(v, 1.0, 8000.0))
        }

        ParamSliderRow {
            sliderName: "wtDecaySlider"
            labelText: qsTr("Decay")
            sliderValue: root.toLogNorm(root.ampDecayMsValue, 5.0, 10000.0)
            resetValue: root.toLogNorm(250.0, 5.0, 10000.0)
            readoutText: root.formatMs(root.ampDecayMsValue)
            onPreviewed: v => root.previewParam("ampDecayMs", root.fromLogNorm(v, 5.0, 10000.0))
            onCommitted: v => root.commitParam("ampDecayMs", root.fromLogNorm(v, 5.0, 10000.0))
        }

        ParamSliderRow {
            sliderName: "wtSustainSlider"
            labelText: qsTr("Sustain")
            sliderValue: root.ampSustainValue
            resetValue: 0.8
            readoutText: root.formatPct(root.ampSustainValue)
            onPreviewed: v => root.previewParam("ampSustain", v)
            onCommitted: v => root.commitParam("ampSustain", v)
        }

        ParamSliderRow {
            sliderName: "wtReleaseSlider"
            labelText: qsTr("Release")
            sliderValue: root.toLogNorm(root.ampReleaseMsValue, 5.0, 12000.0)
            resetValue: root.toLogNorm(300.0, 5.0, 12000.0)
            readoutText: root.formatMs(root.ampReleaseMsValue)
            onPreviewed: v => root.previewParam("ampReleaseMs", root.fromLogNorm(v, 5.0, 12000.0))
            onCommitted: v => root.commitParam("ampReleaseMs", root.fromLogNorm(v, 5.0, 12000.0))
        }
    }
}

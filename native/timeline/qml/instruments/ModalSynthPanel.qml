// Compact physically modeled percussion/mallet instrument panel for the timeline
// (preset, model A/B, coupling, mallet stiffness, decay, tone, hit position,
// inharmonicity, A/B mix). Built exclusively with NodeTool.UiPrimitives per
// native/ui_primitives/DESIGN.md.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: root
    variant: Ui.Surface.Panel
    objectName: "modalSynthPanel"

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

    readonly property string presetValue: activeInstrument.preset ? String(activeInstrument.preset) : "modal-marimba"
    readonly property string modelAValue: activeInstrument.aModel ? String(activeInstrument.aModel) : "marimba"
    readonly property bool bOnValue: activeInstrument.bOn === true
    readonly property string modelBValue: activeInstrument.bModel ? String(activeInstrument.bModel) : "closedTube"
    readonly property string couplingValue: activeInstrument.coupling ? String(activeInstrument.coupling) : "parallel"
    readonly property real malletStiffValue: numOr(activeInstrument.malletStiff, 1530.0)
    readonly property real decayValue: numOr(activeInstrument.aDecay, 6.5)
    readonly property real toneValue: numOr(activeInstrument.aTone, 0.0)
    readonly property real hitValue: numOr(activeInstrument.aHit, 0.26)
    readonly property real inharmValue: numOr(activeInstrument.aInharm, 0.0001)
    readonly property real abMixValue: numOr(activeInstrument.abMix, 0.50)

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

    function formatSec(sec) {
        return sec < 1.0 ? Math.round(sec * 1000.0) + " ms" : sec.toFixed(2) + " s"
    }

    function formatSignedPct(v) {
        const pct = Math.round(v * 100.0)
        return (pct > 0 ? "+" : "") + pct + "%"
    }

    function formatPct(v) {
        return Math.round(v * 100.0) + "%"
    }

    function commitPreset(presetId) {
        if (root.readOnly || !presetId) return
        root.presetSelected(presetId)
        if (root.timeline && root.trackId !== "") {
            root.timeline.applyEdit("modal.setPreset", { trackId: root.trackId, preset: presetId })
        }
    }

    function commitParam(name, value) {
        if (root.readOnly) return
        root.parameterCommitted(name, value)
        if (root.timeline && root.trackId !== "") {
            const payload = { trackId: root.trackId }
            payload[name] = value
            root.timeline.applyEdit("modal.setParams", payload)
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
            text: qsTr("Modal Percussion")
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm

            Ui.Select {
                id: presetSelect
                objectName: "modalPresetSelect"
                Layout.fillWidth: true
                density: Ui.EditorButton.Compact
                enabled: !root.readOnly
                accessibleName: qsTr("Modal preset")
                options: ModalSynthCatalog.presets
                value: root.presetValue
                onValueCommitted: v => root.commitPreset(String(v))
            }

            Ui.SegmentedControl {
                id: couplingControl
                objectName: "modalCouplingControl"
                density: Ui.EditorButton.Compact
                variant: Ui.SegmentedControl.Tray
                enabled: !root.readOnly
                accessibleName: qsTr("Resonator coupling")
                optionNamePrefix: "modalCoupling_"
                options: ModalSynthCatalog.couplings
                value: root.couplingValue
                onValueCommitted: v => root.commitParam("coupling", String(v))
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm

            Ui.Text {
                role: Ui.Typography.SansCaption
                tone: Ui.Text.Secondary
                text: qsTr("Model A")
            }

            Ui.Select {
                id: modelASelect
                objectName: "modalModelASelect"
                Layout.fillWidth: true
                density: Ui.EditorButton.Compact
                enabled: !root.readOnly
                accessibleName: qsTr("Resonator A model")
                options: ModalSynthCatalog.models
                value: root.modelAValue
                onValueCommitted: v => root.commitParam("aModel", String(v))
            }

            Ui.Toggle {
                objectName: "modalBOnToggle"
                text: qsTr("B")
                enabled: !root.readOnly
                checked: root.bOnValue
                onCheckedChangedByUser: checked => root.commitParam("bOn", checked)
            }

            Ui.Select {
                id: modelBSelect
                objectName: "modalModelBSelect"
                Layout.fillWidth: true
                density: Ui.EditorButton.Compact
                enabled: !root.readOnly && root.bOnValue
                accessibleName: qsTr("Resonator B model")
                options: ModalSynthCatalog.models
                value: root.modelBValue
                onValueCommitted: v => root.commitParam("bModel", String(v))
            }
        }

        Ui.Separator {
            Layout.fillWidth: true
        }

        ParamSliderRow {
            sliderName: "modalStiffnessSlider"
            labelText: qsTr("Stiffness")
            sliderValue: root.toLogNorm(root.malletStiffValue, 100.0, 5000.0)
            resetValue: root.toLogNorm(600.0, 100.0, 5000.0)
            readoutText: root.formatHz(root.malletStiffValue)
            onCommitted: v => root.commitParam("malletStiff", root.fromLogNorm(v, 100.0, 5000.0))
        }

        ParamSliderRow {
            sliderName: "modalDecaySlider"
            labelText: qsTr("Decay")
            sliderValue: root.toLogNorm(root.decayValue, 0.01, 100.0)
            resetValue: root.toLogNorm(1.0, 0.01, 100.0)
            readoutText: root.formatSec(root.decayValue)
            onCommitted: v => root.commitParam("aDecay", root.fromLogNorm(v, 0.01, 100.0))
        }

        ParamSliderRow {
            sliderName: "modalToneSlider"
            labelText: qsTr("Tone")
            from: -1.0
            to: 1.0
            sliderValue: root.toneValue
            resetValue: 0.0
            readoutText: root.formatSignedPct(root.toneValue)
            onCommitted: v => root.commitParam("aTone", v)
        }

        ParamSliderRow {
            sliderName: "modalHitSlider"
            labelText: qsTr("Hit Pos")
            from: 0.02
            to: 0.50
            sliderValue: root.hitValue
            resetValue: 0.26
            readoutText: root.formatPct(root.hitValue * 2.0)
            onCommitted: v => root.commitParam("aHit", v)
        }

        ParamSliderRow {
            sliderName: "modalInharmSlider"
            labelText: qsTr("Inharm")
            sliderValue: root.toLogNorm(Math.max(0.0001, root.inharmValue), 0.0001, 1.0)
            resetValue: 0.0
            readoutText: root.formatPct(root.inharmValue)
            onCommitted: v => root.commitParam("aInharm", root.fromLogNorm(v, 0.0001, 1.0))
        }

        ParamSliderRow {
            sliderName: "modalAbMixSlider"
            labelText: qsTr("A/B Mix")
            controlEnabled: !root.readOnly && root.bOnValue && root.couplingValue === "parallel"
            sliderValue: root.abMixValue
            resetValue: 0.50
            readoutText: root.formatPct(root.abMixValue)
            onCommitted: v => root.commitParam("abMix", v)
        }
    }
}

// The instrument device of a MIDI track: one menu that lists the built-in instruments and the
// installed VST3 instruments, and below it the panel for the chosen instrument type.
// Every change goes through an undoable edit: `instrument.setBuiltin` or `setTrackInstrument`.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../vst"
import "DeviceCatalog.js" as Catalog

Column {
    id: root
    property TimelineModel timeline: null
    // JSON data from the document, controller, or shared JavaScript API.
    property var track: null
    property string trackId: track && track.id ? track.id : ""
    // JSON data from the document, controller, or shared JavaScript API.
    readonly property var instrument: track && track.instrument ? track.instrument : ({})
    readonly property string type: instrument.type ? instrument.type : "subtractive"
    readonly property bool readOnly: !track || track.locked === true
    readonly property string currentKey: type === "vst"
        ? (instrument.plugin ? "vst-" + Catalog.pluginKey(instrument.plugin) : "vst") : type
    spacing: Ui.Metrics.sm
    readonly property real preferredWidth: Math.max(Ui.Metrics.panelWidth, panel.item ? panel.item.implicitWidth : 0)

    AutomationController { id: live; timeline: root.timeline; trackId: root.trackId }

    onVisibleChanged: if (!visible) live.cancelDevice("instrument")

    function openMenu() { menu.openAt(menuButton) }

    function choose(entry) {
        if (!timeline || trackId === "" || readOnly || !entry) return
        live.cancelDevice("instrument")
        if (entry.kind === "vst") {
            const gain = instrument.type === "vst" && instrument.gainDb !== undefined ? instrument.gainDb : 0.0
            const plugin = entry.plugin ? { uid: entry.plugin.uid, name: entry.plugin.name, vendor: entry.plugin.vendor, path: entry.plugin.path } : ({})
            timeline.applyEdit("setTrackInstrument", { trackId: trackId, instrument: VstHost.makeVstInstrument(plugin, gain) })
        } else {
            timeline.applyEdit("instrument.setBuiltin", { trackId: trackId, type: entry.type })
        }
    }

    Ui.EditorButton {
        id: menuButton
        objectName: "instrument-menu-" + root.trackId
        width: parent.width
        density: Ui.EditorButton.Compact
        contentAlignment: Qt.AlignLeft
        menuButton: true
        menuExpanded: menu.visible
        enabled: !root.readOnly
        text: Catalog.instrumentLabel(root.instrument)
        accessibleName: qsTr("Instrument: %1").arg(text)
        onClicked: root.openMenu()
    }

    DeviceMenu {
        id: menu
        rowPrefix: "instrument-item-" + root.trackId + "-"
        searchLabel: qsTr("Search instruments")
        currentKey: root.currentKey
        entries: Catalog.instrumentEntries(VstHost.instruments)
        onChosen: entry => root.choose(entry)
    }

    Loader {
        id: panel
        width: parent.width
        sourceComponent: ({ bass: bassPanel, wavetable: wavetablePanel, sampler: samplerPanel, modal: modalPanel,
                            drum: drumPanel, vst: vstPanel })[root.type] || subtractiveNote
    }

    Component {
        id: bassPanel
        BassSynthPanel { timeline: root.timeline; trackId: root.trackId; readOnly: root.readOnly; instrument: root.instrument }
    }
    Component {
        id: wavetablePanel
        WavetableSynthPanel { timeline: root.timeline; trackId: root.trackId; readOnly: root.readOnly; instrument: root.instrument }
    }
    Component {
        id: samplerPanel
        SamplerPanel { timeline: root.timeline; trackId: root.trackId; readOnly: root.readOnly; instrument: root.instrument }
    }
    Component {
        id: modalPanel
        ModalSynthPanel { timeline: root.timeline; trackId: root.trackId; readOnly: root.readOnly; instrument: root.instrument }
    }
    Component {
        id: drumPanel
        DrumKitPanel { timeline: root.timeline; trackId: root.trackId; readOnly: root.readOnly; instrument: root.instrument }
    }
    Component {
        id: subtractiveNote
        Ui.Text {
            objectName: "subtractive-note"
            text: qsTr("The default synth has no settings. Choose an instrument above.")
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            wrapMode: Text.WordWrap
        }
    }
    Component {
        id: vstPanel
        VstPluginControl {
            id: vstControl
            instrumentMode: true
            instanceId: "inst:" + root.trackId
            editorTitle: (root.track && root.track.name ? root.track.name + " - " : "") +
                (root.instrument.plugin && root.instrument.plugin.name ? root.instrument.plugin.name : "VST3")
            plugin: root.instrument.plugin || null
            pluginState: root.instrument.state || ""
            gainDb: root.instrument.gainDb !== undefined ? root.instrument.gainDb : 0.0
            showPicker: !(root.instrument.plugin && root.instrument.plugin.uid)
            disabled: root.readOnly
            onPluginChosen: pluginRef => {
                live.cancelDevice("instrument")
                root.timeline.applyEdit("setTrackInstrument", {
                    trackId: root.trackId, instrument: VstHost.makeVstInstrument(pluginRef || ({}), vstControl.gainDb) })
            }
            onParameterPreviewed: patch => live.previewDevice("instrument", patch)
            onEditCanceled: live.cancelDevice("instrument")
            onGainDbChangedRequested: db => {
                const next = Object.assign({}, root.instrument)
                next.gainDb = db
                live.commitDevice("instrument", {gainDb: db}, "setTrackInstrument", { trackId: root.trackId, instrument: next })
            }
        }
    }
}

import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../vst"

Ui.Popover {
    id: root
    property TimelineModel timeline: null
    property string trackId: ""
    readonly property var track: controller.channel
    readonly property var instrument: track && track.instrument ? track.instrument : null
    readonly property bool isVst: instrument !== null && instrument.type === "vst"
    readonly property bool readOnly: !track || track.locked === true

    width: Math.min(parent ? parent.width : 300, 300)
    height: Math.min(implicitHeight, parent ? parent.height * 0.9 : implicitHeight)

    AutomationController {
        id: controller
        timeline: root.timeline
        trackId: root.trackId
        master: false
    }

    Connections {
        target: root.timeline
        function onDocumentReplaced() { root.close() }
    }

    function show(trackId, anchor) {
        root.trackId = trackId
        root.openAt(anchor)
    }

    function applyInstrument(nextInstrument) {
        if (!root.timeline || !root.trackId || root.readOnly) return
        root.timeline.applyEdit("setTrackInstrument", { trackId: root.trackId, instrument: nextInstrument })
    }

    Column {
        width: parent.width
        spacing: Ui.Metrics.md

        Row {
            width: parent.width
            Ui.Text {
                role: Ui.Typography.SansLabel
                width: parent.width - 24
                elide: Text.ElideRight
                text: (root.track && root.track.name ? root.track.name + " · " : "") + qsTr("Instrument")
            }
            Ui.ToolbarIconButton {
                objectName: "close-instrument-popover"
                iconName: "close"
                accessibleName: qsTr("Close instrument")
                onClicked: root.close()
            }
        }

        VstPluginControl {
            id: vstControl
            width: parent.width
            instrumentMode: true
            instanceId: root.trackId !== "" ? ("inst:" + root.trackId) : ""
            editorTitle: (root.track && root.track.name ? root.track.name + " - " : "") +
                (root.isVst && root.instrument.plugin && root.instrument.plugin.name ? root.instrument.plugin.name : "VST3")
            plugin: root.isVst ? (root.instrument.plugin || null) : null
            pluginState: root.isVst ? (root.instrument.state || null) : null
            gainDb: root.isVst && root.instrument.gainDb !== undefined ? root.instrument.gainDb : 0.0
            disabled: root.readOnly
            onPluginChosen: pluginRef => {
                const next = VstHost.makeVstInstrument(pluginRef || ({}), vstControl.gainDb)
                root.applyInstrument(next)
            }
            onGainDbChangedRequested: db => {
                const base = root.isVst ? Object.assign({}, root.instrument) : VstHost.makeVstInstrument(({}), db)
                base.gainDb = db
                root.applyInstrument(base)
            }
        }
    }
}

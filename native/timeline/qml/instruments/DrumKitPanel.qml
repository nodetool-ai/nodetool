// Kit choice for the built-in drum sampler. The kit change is an undoable `instrument.setBuiltin` edit.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: root
    variant: Ui.Surface.Panel
    objectName: "drumKitPanel"
    property TimelineModel timeline: null
    property string trackId: ""
    property bool readOnly: false
    property var instrument: ({})
    readonly property string kitValue: String(instrument.kit || instrument.preset || "808").toLowerCase().indexOf("uzu") >= 0 ? "uzu" : "808"

    readonly property var activeInstrument: live.channel.instrument || instrument
    AutomationController { id: live; timeline: root.timeline; trackId: root.trackId }
    function cancelPreview() { live.cancelDevice("instrument") }
    onVisibleChanged: if (!visible) cancelPreview()
    onTrackIdChanged: cancelPreview()

    implicitWidth: Ui.Metrics.panelWidth
    implicitHeight: column.implicitHeight + 2 * Ui.Metrics.md

    Column {
        id: column
        x: Ui.Metrics.md
        y: Ui.Metrics.md
        width: parent.width - 2 * Ui.Metrics.md
        spacing: Ui.Metrics.sm
        Ui.Text {
            text: qsTr("Kit")
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
        Ui.Select {
            objectName: "drum-kit-select"
            width: parent.width
            density: Ui.EditorButton.Compact
            accessibleName: qsTr("Drum kit")
            readOnly: root.readOnly
            options: [{ value: "808", label: qsTr("808 Classic") }, { value: "uzu", label: qsTr("UZU") }]
            value: root.kitValue
            onValueCommitted: kit => {
                root.cancelPreview()
                if (root.timeline && root.trackId !== "" && kit !== root.kitValue)
                    root.timeline.applyEdit("instrument.setBuiltin", { trackId: root.trackId, type: "drum", preset: kit })
            }
        }
        Ui.Text { text: qsTr("Gain"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        Ui.Slider {
            objectName: "drumGainSlider"
            width: parent.width
            from: -60; to: 12
            value: root.activeInstrument.gainDb !== undefined ? root.activeInstrument.gainDb : 0
            enabled: !root.readOnly
            accessibleName: qsTr("Drum gain")
            cancelOnFocusLoss: true
            onValuePreviewed: value => live.previewDevice("instrument", {gainDb: value})
            onEditCanceled: root.cancelPreview()
            onValueCommitted: value => {
                const next = Object.assign({}, root.activeInstrument, {gainDb: value})
                live.commitDevice("instrument", {gainDb: value}, "setTrackInstrument", {instrument: next})
            }
        }
    }
}

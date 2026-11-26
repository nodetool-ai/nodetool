import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../../vst"
import "../../instruments"
import "../../instruments/DeviceCatalog.js" as Catalog

Ui.Surface {
    id: effectsPanel
    property bool playheadPassthrough: true
    required property var track
    required property TimelineModel timeline
    readonly property var reference: TrackEffectsReference.data
    readonly property var strings: reference.strings
    readonly property var effects: orderedEffects()
    readonly property bool isVideo: track.type === "video"
    property int draggingIndex: -1
    property int dropIndex: -1
    objectName: "track-effects-panel-" + track.id
    implicitHeight: 280
    variant: Ui.Surface.Canvas
    function orderedEffects() {
        const authored = track.effects ?? []
        if (!isVideo) return authored
        const stages = {chromaKey: 0, colorCorrection: 1, videoBlur: 2, sharpen: 3, vignette: 4}
        return authored.map((effect, index) => ({effect: effect, index: index}))
            .sort((a, b) => (stages[a.effect.type] ?? 5) - (stages[b.effect.type] ?? 5) || a.index - b.index)
            .map(entry => entry.effect)
    }
    function dropPosition(x) {
        for (let i = 0; i < cards.count; ++i) {
            const card = cards.itemAt(i)
            if (x >= card.x && x <= card.x + card.width) return x < card.x + card.width / 2 ? i : i + 1
        }
        return -1
    }
    function dragOver(x) { dropIndex = isVideo ? -1 : dropPosition(x) }
    function drop(from, x) {
        if (isVideo) { draggingIndex = -1; dropIndex = -1; return }
        let to = dropPosition(x)
        draggingIndex = -1
        dropIndex = -1
        if (to < 0) return
        if (from < to) --to
        timeline.applyEdit("moveTrackEffect", {trackId: track.id, oldIndex: from, newIndex: to})
    }
    Ui.Separator { width: parent.width }
    Ui.Separator { anchors.bottom: parent.bottom; width: parent.width }
    Item {
        id: header
        x: Ui.Metrics.lg
        y: Ui.Metrics.md
        width: parent.width - 2 * Ui.Metrics.lg
        height: add.height
        Ui.Text {
            anchors.left: parent.left
            width: Math.max(0, add.x - x - Ui.Metrics.sm)
            elide: Text.ElideRight
            anchors.verticalCenter: parent.verticalCenter
            text: (effectsPanel.isVideo ? "Video effects (fixed order)" : effectsPanel.strings.dspChain) + " - " + effectsPanel.track.name
            role: Ui.Typography.SansLabel; tone: Ui.Text.Primary
        }
        Ui.EditorButton {
            id: add
            objectName: "fx-add-" + effectsPanel.track.id
            anchors.right: parent.right
            text: effectsPanel.strings.add
            accessibleName: text
            iconName: "add"
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Primary
            menuButton: true
            menuExpanded: addMenu.visible
            onClicked: addMenu.openAt(add)
            DeviceMenu {
                id: addMenu
                rowPrefix: "fx-add-type-" + effectsPanel.track.id + "-"
                searchLabel: qsTr("Search effects")
                entries: effectsPanel.isVideo
                    ? Catalog.effectEntries(effectsPanel.reference.videoTypes, effectsPanel.strings.labels, [], null)
                    : Catalog.effectEntries(effectsPanel.reference.audioTypes.concat(effectsPanel.reference.fableKinds),
                                            effectsPanel.strings.labels, effectsPanel.reference.fableKinds, VstHost.effects)
                onChosen: entry => {
                    const effect = entry.kind === "fable" ? TrackEffectsReference.makeFableEffect(entry.type)
                        : entry.kind === "vst" ? VstHost.makeVstEffect(entry.plugin
                            ? { uid: entry.plugin.uid, name: entry.plugin.name, vendor: entry.plugin.vendor, path: entry.plugin.path } : ({}))
                        : entry.type
                    effectsPanel.timeline.applyEdit("addTrackEffect", {trackId: effectsPanel.track.id, effect: effect})
                }
            }
        }
    }
    Ui.Text {
        objectName: "fx-empty-" + effectsPanel.track.id
        visible: effectsPanel.effects.length === 0 && effectsPanel.track.type !== "midi"
        x: Ui.Metrics.lg
        y: header.y + header.height + Ui.Metrics.md
        text: effectsPanel.strings.emptyPrefix + " <b>" + effectsPanel.strings.add + "</b> " + effectsPanel.strings.emptySuffix
        textFormat: Text.RichText
        tone: Ui.Text.Secondary
        role: Ui.Typography.SansLabel
    }
    Flickable {
        id: rack
        x: Ui.Metrics.lg
        y: header.y + header.height + Ui.Metrics.md
        width: parent.width - 2 * Ui.Metrics.lg
        height: parent.height - y - Ui.Metrics.lg
        clip: true
        contentWidth: devices.width
        contentHeight: height
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.HorizontalFlick
        Basic.ScrollBar.horizontal: Ui.ScrollBar { }
        Row {
            id: devices
            spacing: Ui.Metrics.md
            Ui.Surface {
                id: instrumentCard
                objectName: "midi-instrument-card-" + effectsPanel.track.id
                visible: effectsPanel.track.type === "midi"
                width: visible ? instrumentRack.preferredWidth + 2 * Ui.Metrics.md : 0
                height: rack.height
                Flickable {
                    x: Ui.Metrics.md
                    y: Ui.Metrics.md
                    width: parent.width - 2 * Ui.Metrics.md
                    height: parent.height - 2 * Ui.Metrics.md
                    clip: true
                    contentHeight: instrumentRack.implicitHeight
                    boundsBehavior: Flickable.StopAtBounds
                    Basic.ScrollBar.vertical: Ui.ScrollBar { }
                    InstrumentRack {
                        id: instrumentRack
                        width: parent.width
                        timeline: effectsPanel.timeline
                        track: effectsPanel.track
                    }
                }
            }
            Repeater {
                id: cards
                model: effectsPanel.effects
                delegate: EffectCard {
                    required property var modelData
                    required property int index
                    effect: modelData
                    effectIndex: index
                    panel: effectsPanel
                    rackRow: devices
                    height: rack.height
                }
            }
        }
    }
}

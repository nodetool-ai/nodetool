import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: effectsPanel
    property bool playheadPassthrough: true
    required property var track
    required property TimelineModel timeline
    readonly property var reference: TrackEffectsReference.data
    readonly property var strings: reference.strings
    readonly property var effects: track.effects ?? []
    readonly property bool isVideo: track.type === "video"
    property int draggingIndex: -1
    property int dropIndex: -1
    objectName: "track-effects-panel-" + track.id
    implicitHeight: 280
    variant: Ui.Surface.Canvas
    function dropPosition(x) {
        for (let i = 0; i < cards.count; ++i) {
            const card = cards.itemAt(i)
            if (x >= card.x && x <= card.x + card.width) return x < card.x + card.width / 2 ? i : i + 1
        }
        return -1
    }
    function dragOver(x) { dropIndex = dropPosition(x) }
    function drop(from, x) {
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
            text: (effectsPanel.isVideo ? effectsPanel.strings.fxChain : effectsPanel.strings.dspChain) + " - " + effectsPanel.track.name
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
            onClicked: addMenu.openAt(add)
            Ui.ContextMenu {
                id: addMenu
                width: 180
                Instantiator {
                    model: effectsPanel.isVideo ? effectsPanel.reference.videoTypes : effectsPanel.reference.audioTypes.concat(effectsPanel.reference.fableKinds)
                    delegate: Ui.MenuItem {
                        id: entry
                        required property string modelData
                        objectName: "fx-add-type-" + effectsPanel.track.id + "-" + modelData
                        text: effectsPanel.strings.labels[modelData]
                        onTriggered: {
                            const effect = effectsPanel.reference.fableKinds.includes(modelData) ? TrackEffectsReference.makeFableEffect(modelData) : modelData
                            effectsPanel.timeline.applyEdit("addTrackEffect", {trackId: effectsPanel.track.id, effect: effect})
                        }
                    }
                    onObjectAdded: (index, object) => addMenu.insertItem(index, object)
                    onObjectRemoved: (index, object) => addMenu.removeItem(object)
                }
            }
        }
    }
    Ui.Text {
        objectName: "fx-empty-" + effectsPanel.track.id
        visible: effectsPanel.effects.length === 0
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

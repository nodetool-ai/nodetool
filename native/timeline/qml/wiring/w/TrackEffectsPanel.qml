import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

Rectangle {
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
    color: Theme.backgroundDefault
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
    Rectangle { width: parent.width; height: 1; color: Theme.divider }
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.divider }
    Item {
        id: header
        x: Theme.spacingLg
        y: Theme.spacingMd
        width: parent.width - 2 * Theme.spacingLg
        height: add.height
        Text {
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: (effectsPanel.isVideo ? effectsPanel.strings.fxChain : effectsPanel.strings.dspChain) + " - " + effectsPanel.track.name
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            font.weight: Font.Medium
        }
        Button {
            id: add
            objectName: "fx-add-" + effectsPanel.track.id
            anchors.right: parent.right
            text: effectsPanel.strings.add
            implicitWidth: addRow.width + 2 * Theme.spacingMd
            implicitHeight: addRow.height + 2 * Theme.spacingXs
            onClicked: addMenu.popup(add.width - addMenu.width, add.height)
            background: Rectangle { color: add.hovered ? Qt.lighter(Theme.primary, 1.1) : Theme.primary; radius: Theme.radiusXs }
            contentItem: Item {
                Row {
                    id: addRow
                    anchors.centerIn: parent
                    spacing: Theme.spacingXs
                    Icon { anchors.verticalCenter: parent.verticalCenter; path: Icons.add; size: Theme.iconXs; color: effectsPanel.reference.palette.primaryContrast }
                    Text { text: add.text; color: effectsPanel.reference.palette.primaryContrast; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller }
                }
            }
            Menu {
                id: addMenu
                width: 180
                padding: Theme.spacingXs
                background: Rectangle { color: Theme.backgroundPaper; radius: Theme.radiusLg; border.width: 1; border.color: Theme.divider }
                Instantiator {
                    model: effectsPanel.isVideo ? effectsPanel.reference.videoTypes : effectsPanel.reference.audioTypes.concat(effectsPanel.reference.fableKinds)
                    delegate: MenuItem {
                        id: entry
                        required property string modelData
                        objectName: "fx-add-type-" + effectsPanel.track.id + "-" + modelData
                        text: effectsPanel.strings.labels[modelData]
                        height: 28
                        leftPadding: Theme.spacingMd
                        rightPadding: Theme.spacingMd
                        contentItem: Text {
                            text: entry.text; color: Theme.textPrimary
                            font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium
                            verticalAlignment: Text.AlignVCenter
                        }
                        background: Rectangle { color: entry.highlighted ? Theme.actionHover : "transparent"; radius: Theme.radiusSm }
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
    Text {
        objectName: "fx-empty-" + effectsPanel.track.id
        visible: effectsPanel.effects.length === 0
        x: Theme.spacingLg
        y: header.y + header.height + Theme.spacingMd
        text: effectsPanel.strings.emptyPrefix + " <b>" + effectsPanel.strings.add + "</b> " + effectsPanel.strings.emptySuffix
        textFormat: Text.RichText
        color: Theme.textSecondary
        font.family: Theme.sansFamily
        font.pixelSize: Theme.fontSizeSmall
    }
    Flickable {
        id: rack
        x: Theme.spacingLg
        y: header.y + header.height + Theme.spacingMd
        width: parent.width - 2 * Theme.spacingLg
        height: parent.height - y - Theme.spacingLg
        clip: true
        contentWidth: devices.width
        contentHeight: height
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.HorizontalFlick
        ScrollBar.horizontal: ScrollBar { }
        Row {
            id: devices
            spacing: Theme.spacingMd
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

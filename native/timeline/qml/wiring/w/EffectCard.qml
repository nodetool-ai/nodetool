import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

Rectangle {
    id: card
    required property var effect
    required property int effectIndex
    required property var panel
    required property Item rackRow
    property var draft: ({})
    readonly property var edited: Object.assign({}, effect, draft)
    readonly property string effectLabel: panel.strings.labels[effect.type === "fable" ? effect.kind : effect.type]
    objectName: "effect-" + effect.id
    width: effect.type === "fable" ? panel.reference.fableWidths[effect.kind] : panel.reference.widths[effect.type]
    radius: Theme.radiusSm
    border.width: 1
    border.color: Theme.divider
    color: Theme.backgroundPaper
    opacity: panel.draggingIndex === effectIndex ? 0.4 : 1
    function preview(patch) { draft = Object.assign({}, draft, patch) }
    function commit(patch) {
        const finalPatch = Object.assign({}, draft, patch)
        draft = ({})
        panel.timeline.applyEdit("updateTrackEffect", {trackId: panel.track.id, effectId: effect.id, patch: finalPatch})
    }
    Rectangle {
        visible: card.panel.dropIndex === card.effectIndex || (card.effectIndex === card.panel.effects.length - 1 && card.panel.dropIndex === card.effectIndex + 1)
        x: card.panel.dropIndex === card.effectIndex ? -5 : card.width + 2
        width: 3; height: parent.height; radius: Theme.radiusXs; color: Theme.primary
    }
    Item {
        id: header
        x: Theme.spacingMd
        y: Theme.spacingMd
        width: parent.width - 2 * Theme.spacingMd
        height: 24
        Item {
            id: grip
            objectName: "fx-grip-" + card.effect.id
            width: 16; height: parent.height
            activeFocusOnTab: true
            Accessible.role: Accessible.Button
            Accessible.name: card.panel.strings.reorder.replace("{{label}}", card.effectLabel)
            Accessible.description: card.panel.strings.reorderHelp
            Keys.onPressed: event => {
                if (!(event.modifiers & Qt.AltModifier)) return
                const delta = event.key === Qt.Key_Left || event.key === Qt.Key_Up ? -1
                    : event.key === Qt.Key_Right || event.key === Qt.Key_Down ? 1 : 0
                if (delta) {
                    event.accepted = true
                    card.panel.timeline.applyEdit("moveTrackEffect", {trackId: card.panel.track.id, oldIndex: card.effectIndex, newIndex: card.effectIndex + delta})
                }
            }
            Icon { anchors.centerIn: parent; path: Icons.dragIndicator; size: 16; color: mouse.containsMouse ? Theme.textSecondary : Theme.textDisabled }
            MouseArea {
                id: mouse
                anchors.fill: parent
                hoverEnabled: true
                preventStealing: true
                cursorShape: pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor
                onPressed: { grip.forceActiveFocus(); card.panel.draggingIndex = card.effectIndex }
                onPositionChanged: event => { if (pressed) card.panel.dragOver(mapToItem(card.rackRow, event.x, event.y).x) }
                onReleased: event => {
                    const point = mapToItem(card.rackRow, event.x, event.y)
                    if (point.y < 0 || point.y > card.height) {
                        card.panel.draggingIndex = -1
                        card.panel.dropIndex = -1
                    } else card.panel.drop(card.effectIndex, point.x)
                }
                onCanceled: { card.panel.draggingIndex = -1; card.panel.dropIndex = -1 }
            }
            ToolTip.visible: mouse.containsMouse
            ToolTip.delay: 500
            ToolTip.text: card.panel.strings.reorderHelp
        }
        FxPower {
            id: power
            objectName: "fx-power-" + card.effect.id
            x: grip.width + Theme.spacingXs
            anchors.verticalCenter: parent.verticalCenter
            on: card.effect.enabled
            label: card.effectLabel
            onToggle: card.commit({enabled: !card.effect.enabled})
        }
        Text {
            x: power.x + power.width + Theme.spacingXs
            anchors.verticalCenter: parent.verticalCenter
            text: card.effectLabel
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
        }
        Item {
            id: remove
            objectName: "fx-remove-" + card.effect.id
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: 18; height: 18
            activeFocusOnTab: true
            Accessible.role: Accessible.Button
            Accessible.name: card.panel.strings.remove.replace("{{label}}", card.effectLabel)
            function activate() { card.panel.timeline.applyEdit("removeTrackEffect", {trackId: card.panel.track.id, effectId: card.effect.id}) }
            Accessible.onPressAction: activate()
            Keys.onSpacePressed: activate()
            Keys.onReturnPressed: activate()
            Rectangle { anchors.fill: parent; radius: Theme.radiusXs; color: removeHover.hovered ? Theme.actionHover : "transparent" }
            Icon { anchors.centerIn: parent; path: Icons.deleteOutline; size: 14; color: Theme.textSecondary }
            TapHandler { onTapped: remove.activate() }
            HoverHandler { id: removeHover; cursorShape: Qt.PointingHandCursor }
            ToolTip.visible: removeHover.hovered
            ToolTip.delay: 500
            ToolTip.text: card.panel.strings.removeHelp
        }
    }
    Flickable {
        x: Theme.spacingMd
        y: header.y + header.height + Theme.spacingXs
        width: parent.width - 2 * Theme.spacingMd
        height: parent.height - y - Theme.spacingMd
        contentWidth: width
        contentHeight: params.implicitHeight
        clip: true
        interactive: contentHeight > height && !TrackEffectsState.parameterGesture
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: ScrollBar { }
        TrackEffectParams {
            id: params
            width: parent.width
            effect: card.edited
            disabled: !card.effect.enabled
            onPreview: patch => card.preview(patch)
            onCommit: patch => card.commit(patch)
        }
    }
}

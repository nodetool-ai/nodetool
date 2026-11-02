import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: card
    required property var effect
    required property int effectIndex
    required property var panel
    required property Item rackRow
    property var draft: ({})
    readonly property var edited: Object.assign({}, effect, draft)
    readonly property string effectLabel: panel.strings.labels[effect.type === "fable" ? effect.kind : effect.type]
    readonly property bool ignoredDuplicate: panel.isVideo && effect.enabled
        && ["chromaKey", "sharpen", "vignette"].includes(effect.type)
        && panel.effects.find(candidate => candidate.type === effect.type && candidate.enabled)?.id !== effect.id
    objectName: "effect-" + effect.id
    width: effect.type === "fable" ? panel.reference.fableWidths[effect.kind] : panel.reference.widths[effect.type]
    opacity: panel.draggingIndex === effectIndex ? 0.4 : 1
    InspectorEdits { id: edits; model: card.panel.timeline }
    function payload(patch) { return {trackId: panel.track.id, effectId: effect.id, patch: patch} }
    function preview(patch) {
        if (Object.keys(draft).length === 0) edits.beginGesture("updateTrackEffect", payload({}))
        draft = Object.assign({}, draft, patch)
        edits.preview(payload(draft))
    }
    function cancel() { edits.cancelGesture(); draft = ({}) }
    Component.onDestruction: edits.cancelGesture()
    onVisibleChanged: if (!visible && edits) cancel()
    function commit(patch) {
        const wasPreviewing = Object.keys(draft).length > 0
        const finalPatch = Object.assign({}, draft, patch)
        draft = ({})
        if (Object.keys(finalPatch).length === 0) return
        if (wasPreviewing) edits.commit("updateTrackEffect", payload(finalPatch))
        else edits.apply("updateTrackEffect", payload(finalPatch))
    }
    Rectangle {
        visible: card.panel.dropIndex === card.effectIndex || (card.effectIndex === card.panel.effects.length - 1 && card.panel.dropIndex === card.effectIndex + 1)
        x: card.panel.dropIndex === card.effectIndex ? -5 : card.width + 2
        width: 3; height: parent.height; radius: Ui.Metrics.micro; color: Ui.Theme.accentPrimary
    }
    Item {
        id: header
        x: Ui.Metrics.md
        y: Ui.Metrics.md
        width: parent.width - 2 * Ui.Metrics.md
        height: 24
        Item {
            id: grip
            objectName: "fx-grip-" + card.effect.id
            visible: !card.panel.isVideo
            width: visible ? Ui.Metrics.iconSm : 0; height: parent.height
            activeFocusOnTab: visible
            Accessible.role: Accessible.Button
            Accessible.name: card.panel.strings.reorder.replace("{{label}}", card.effectLabel)
            Accessible.description: card.panel.strings.reorderHelp
            Keys.onPressed: event => {
                if (card.panel.isVideo) return
                if (!(event.modifiers & Qt.AltModifier)) return
                const delta = event.key === Qt.Key_Left || event.key === Qt.Key_Up ? -1
                    : event.key === Qt.Key_Right || event.key === Qt.Key_Down ? 1 : 0
                if (delta) {
                    event.accepted = true
                    card.panel.timeline.applyEdit("moveTrackEffect", {trackId: card.panel.track.id, oldIndex: card.effectIndex, newIndex: card.effectIndex + delta})
                }
            }
            Ui.Icon { anchors.centerIn: parent; name: "dragIndicator"; size: Ui.Metrics.iconSm; tone: mouse.containsMouse ? Ui.Text.Secondary : Ui.Text.Disabled }
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
            Ui.Tooltip { trigger: grip; visible: mouse.containsMouse; text: card.panel.strings.reorderHelp }
        }
        FxPower {
            id: power
            objectName: "fx-power-" + card.effect.id
            x: grip.width + Ui.Metrics.xs
            anchors.verticalCenter: parent.verticalCenter
            on: card.effect.enabled
            label: card.effectLabel
            onToggle: card.commit({enabled: !card.effect.enabled})
        }
        Ui.Text {
            x: power.x + power.width + Ui.Metrics.xs
            width: Math.max(0, remove.x - x - Ui.Metrics.xs)
            elide: Text.ElideRight
            anchors.verticalCenter: parent.verticalCenter
            text: card.effectLabel
            role: Ui.Typography.SansLabel; tone: Ui.Text.Primary
        }
        Ui.ToolbarIconButton {
            id: remove
            objectName: "fx-remove-" + card.effect.id
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            iconName: "deleteOutline"
            accessibleName: card.panel.strings.remove.replace("{{label}}", card.effectLabel)
            description: card.panel.strings.removeHelp
            onClicked: card.panel.timeline.applyEdit("removeTrackEffect", {trackId: card.panel.track.id, effectId: card.effect.id})
        }
    }
    Ui.Text {
        id: stageNote
        objectName: "fx-stage-" + card.effect.id
        x: Ui.Metrics.md
        y: header.y + header.height + Ui.Metrics.xs
        width: parent.width - 2 * Ui.Metrics.md
        visible: card.panel.isVideo
        height: visible ? implicitHeight : 0
        wrapMode: Text.WordWrap
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
        text: card.ignoredDuplicate ? "Not applied. An earlier instance is enabled."
            : ({chromaKey: "Before clip effects. First enabled instance applies.",
                colorCorrection: "After clip effects. Combined color grade.",
                videoBlur: "After color grade. Blur radii are combined.",
                sharpen: "After blur. First enabled instance applies.",
                vignette: "After sharpen. First enabled instance applies."})[card.effect.type] ?? "Unsupported in this build."
    }
    Flickable {
        x: Ui.Metrics.md
        y: card.panel.isVideo ? stageNote.y + stageNote.height + Ui.Metrics.xs : header.y + header.height + Ui.Metrics.xs
        width: parent.width - 2 * Ui.Metrics.md
        height: parent.height - y - Ui.Metrics.md
        contentWidth: width
        contentHeight: params.implicitHeight
        clip: true
        interactive: contentHeight > height && !TrackEffectsState.parameterGesture
        boundsBehavior: Flickable.StopAtBounds
        Basic.ScrollBar.vertical: Ui.ScrollBar { }
        TrackEffectParams {
            id: params
            width: parent.width
            effect: card.edited
            disabled: !card.effect.enabled
            onPreview: patch => card.preview(patch)
            onCommit: patch => card.commit(patch)
            onEditCanceled: card.cancel()
        }
    }
}

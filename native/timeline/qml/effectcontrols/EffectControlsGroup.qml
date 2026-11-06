pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../../src/edit/clipeffects" as ClipFx
import "../../src/edit/clipeffects/ClipEffectsCatalog.js" as Catalog
import "../Inspector/AudioEffectsKnobs.js" as AudioKnobs
// One collapsible block: a fixed effect (Motion, Opacity, Volume), the camera of a 3D clip, a
// section (Time Remapping and Motion blur have no keyframes, Crop and Corners do), or an effect on the
// clip's chain. Whatever it holds sits in the list column, so the lanes beside it stay empty.
Column {
    id: root
    required property var panel
    required property var group
    readonly property var controller: panel.controller
    readonly property int revision: controller.revision
    readonly property var effect: {
        const revision = root.revision
        if (group.kind === "effect") return (panel.clipData.effects || []).find(e => e.id === group.effectId) || ({})
        if (group.kind === "audioEffect") return (panel.clipData.audioEffects || []).find(e => e.id === group.effectId) || ({})
        return ({})
    }
    readonly property string label: group.kind === "effect" ? Catalog.name(group.effectType)
        : group.kind === "audioEffect" ? (AudioKnobs.labels[group.effectType] || group.effectType) : group.label
    // A section's own switch shows in the group's heading, as Time Remapping's does.
    readonly property var sectionItem: group.kind === "section" && sectionLoader.item ? sectionLoader.item : null
    readonly property bool switchable: group.kind === "section" ? !!sectionItem && sectionItem.checkable === true : group.kind !== "camera"
    readonly property bool groupOn: {
        const revision = root.revision
        if (group.kind === "fixed") return controller.groupEnabled(group.id)
        if (group.kind === "camera") return true
        if (group.kind === "section") return !switchable || sectionItem.checked
        return effect.enabled === true
    }
    // Fixed groups and sections keep their fold across clips and sessions, as the Color panel's do.
    readonly property bool remembersFold: group.kind === "fixed" || group.kind === "section" || group.kind === "camera"
    readonly property string foldKey: "effectControls." + group.id
    property bool localOpen: true
    readonly property bool open: remembersFold ? ClipEffectsUi.folds[foldKey] ?? group.startsOpen !== false : localOpen
    function setOpen(next) {
        if (remembersFold) ClipEffectsUi.setFold(foldKey, next)
        else localOpen = next
    }
    // A group that starts closed builds its rows when first opened, and a fold keeps them after that,
    // with any graphs they have open. Rows are what makes a clip slow to select.
    property bool hasBeenOpen: false
    onOpenChanged: if (open) hasBeenOpen = true
    Component.onCompleted: hasBeenOpen = open
    readonly property int audioEffectIndex: group.kind === "audioEffect" ? (panel.clipData.audioEffects || []).findIndex(e => e.id === group.effectId) : -1
    function moveAudioEffect(delta) {
        controller.timeline.applyEdit("moveClipAudioEffect", {clipId: panel.clipData.id, effectId: group.effectId, delta: delta})
    }
    function setOn(on) {
        if (group.kind === "section") {
            sectionItem.checkedChangedByUser(on)
        } else if (group.kind === "fixed") {
            panel.clearSelection()
            controller.write({action: "bypass", group: group.id, enabled: on})
        } else if (group.kind === "effect") {
            panel.clearSelection()
            panel.effectEdits.patch(group.effectId, {enabled: on})
        } else if (group.kind === "audioEffect") {
            controller.timeline.applyEdit("patchClipAudioEffect", {clipId: panel.clipData.id, effectId: group.effectId, patch: {enabled: on}})
        }
    }
    Item {
        objectName: "effectControlsGroup_" + root.group.id
        width: root.width
        height: Ui.Metrics.compact
        Rectangle { width: parent.width; height: parent.height; color: Ui.Theme.surfacePanel }
        RowLayout {
            x: Ui.Metrics.xs
            width: root.panel.listWidth - Ui.Metrics.md
            height: parent.height
            spacing: Ui.Metrics.xs
            Ui.ToolbarIconButton {
                objectName: "effectControlsCollapse_" + root.group.id
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                iconName: root.open ? "arrowDropDown" : "navigateNext"
                accessibleName: (root.open ? "Collapse " : "Expand ") + root.label
                onClicked: root.setOpen(!root.open)
            }
            Ui.Toggle {
                id: enableSwitch
                objectName: "effectControlsEnable_" + root.group.id
                visible: root.switchable
                enabled: !root.panel.locked
                accessibleName: root.label + " enabled"
                Binding { target: enableSwitch; property: "checked"; value: root.groupOn }
                onCheckedChangedByUser: checked => root.setOn(checked)
            }
            Ui.Text {
                Layout.fillWidth: true
                text: root.label
                elide: Text.ElideRight
                role: Ui.Typography.SansLabel
                tone: root.groupOn ? Ui.Text.Primary : Ui.Text.Secondary
            }
            Ui.ToolbarIconButton {
                id: reorder
                objectName: "effectsReorder_" + root.group.effectId
                visible: root.group.kind === "effect" && root.panel.effectEdits.processingStage(root.effect) === 0
                enabled: !root.panel.locked
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                iconName: "dragIndicator"
                accessibleName: "Reorder " + root.label
                description: "Drag to reorder, or use Alt + arrow keys"
                Keys.onPressed: event => {
                    if ((event.modifiers & Qt.AltModifier) && (event.key === Qt.Key_Up || event.key === Qt.Key_Down)) {
                        root.panel.effectEdits.move(root.group.effectId, event.key === Qt.Key_Up ? -1 : 1)
                        event.accepted = true
                    }
                }
                Item {
                    id: reorderProxy
                    width: reorder.width
                    height: reorder.height
                    Drag.active: reorderDrag.drag.active
                    Drag.source: root
                    Drag.keys: ["clip-effect"]
                    Drag.hotSpot.x: width / 2
                    Drag.hotSpot.y: height / 2
                }
                MouseArea {
                    id: reorderDrag
                    anchors.fill: parent
                    drag.target: reorderProxy
                    preventStealing: true
                    onPressed: reorder.forceActiveFocus()
                    onReleased: {
                        reorderProxy.Drag.drop()
                        reorderProxy.x = 0
                        reorderProxy.y = 0
                    }
                    onCanceled: {
                        reorderProxy.Drag.cancel()
                        reorderProxy.x = 0
                        reorderProxy.y = 0
                    }
                }
            }
            Ui.ToolbarIconButton {
                objectName: "effectControlsOpenColor_" + root.group.effectId
                visible: root.group.kind === "effect" && Catalog.gradedInColorPanel(root.group.effectType)
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                iconName: "brightness"
                accessibleName: "Open " + root.label + " in the Color panel"
                description: accessibleName
                onClicked: root.panel.revealPanel("color")
            }
            Ui.ToolbarIconButton {
                objectName: "audioEffectUp-" + root.group.effectId
                visible: root.group.kind === "audioEffect"
                enabled: !root.panel.locked && root.audioEffectIndex > 0
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                iconName: "arrowUpward"
                accessibleName: "Move " + root.label + " up"
                description: "Move earlier in the chain"
                onClicked: root.moveAudioEffect(-1)
            }
            Ui.ToolbarIconButton {
                objectName: "audioEffectDown-" + root.group.effectId
                visible: root.group.kind === "audioEffect"
                enabled: !root.panel.locked && root.audioEffectIndex >= 0 && root.audioEffectIndex < (root.panel.clipData.audioEffects || []).length - 1
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                iconName: "arrowDownward"
                accessibleName: "Move " + root.label + " down"
                description: "Move later in the chain"
                onClicked: root.moveAudioEffect(1)
            }
            Ui.ToolbarIconButton {
                objectName: "effectsRemove_" + root.group.effectId
                visible: root.group.kind === "effect"
                enabled: !root.panel.locked
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                iconName: "close"
                accessibleName: "Remove " + root.label + " effect"
                description: accessibleName
                onClicked: root.panel.effectEdits.remove(root.group.effectId)
            }
            Ui.ToolbarIconButton {
                objectName: "audioEffectRemove-" + root.group.effectId
                visible: root.group.kind === "audioEffect"
                enabled: !root.panel.locked
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                iconName: "close"
                accessibleName: "Remove " + root.label
                description: accessibleName
                onClicked: root.controller.timeline.applyEdit("removeClipAudioEffect", {clipId: root.panel.clipData.id, effectId: root.group.effectId})
            }
        }
        Ui.Separator { y: parent.height - height; width: parent.width }
        // It reaches past this heading, over the group's rows, so a drop anywhere on the group lands.
        DropArea {
            width: parent.width
            height: root.height
            enabled: root.group.kind === "effect" && root.panel.effectEdits.processingStage(root.effect) === 0
            keys: ["clip-effect"]
            onDropped: drop => {
                if (drop.source && drop.source.group && !root.panel.locked) {
                    root.panel.effectEdits.drop(drop.source.group.effectId, root.group.effectId)
                    drop.acceptProposedAction()
                }
            }
        }
    }
    Column {
        width: root.width
        visible: root.open
        Repeater {
            model: root.open || root.hasBeenOpen ? root.group.rows : []
            delegate: EffectControlsRow {
                required property var modelData
                width: root.width
                panel: root.panel
                row: modelData
                bypassed: !root.groupOn
            }
        }
        Loader {
            id: sectionLoader
            objectName: "effectControlsSection_" + root.group.id
            active: !!root.group.source
            visible: active
            x: Ui.Metrics.md
            width: root.panel.listWidth - x - Ui.Metrics.md
            height: item ? item.implicitHeight : 0
            Component.onCompleted: {
                if (active) setSource(root.group.source, {
                    timelineModel: Qt.binding(() => root.controller.timeline),
                    gestures: Qt.binding(() => root.panel.gestures),
                    controller: root.controller,
                    embedded: true
                })
            }
        }
        Ui.Text {
            objectName: "effectsStage_" + root.group.effectId
            readonly property int stage: root.group.kind === "effect" ? root.panel.effectEdits.processingStage(root.effect) : 0
            visible: stage !== 0
            x: Ui.Metrics.md
            width: root.panel.listWidth - x - Ui.Metrics.md
            wrapMode: Text.WordWrap
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            text: stage === -2 ? "Source noise reduction before stabilization" : stage === -1 ? "Source stabilization before clip effects" : stage === 1 ? "Combined color grade after clip effects" : "Combined blur after color grade"
        }
        Loader {
            active: root.group.kind === "effect" && root.open
            visible: active
            x: Ui.Metrics.md
            width: root.panel.listWidth - x - Ui.Metrics.md
            enabled: root.groupOn
            sourceComponent: ClipFx.EffectFields {
                editor: root.panel.effectEdits
                effectId: root.group.effectId
            }
        }
        Loader {
            active: root.group.kind === "audioEffect" && root.open
            visible: active
            x: Ui.Metrics.md
            width: root.panel.listWidth - x - Ui.Metrics.md
            enabled: root.groupOn
            sourceComponent: AudioEffectsFields {
                effect: root.effect
                timeline: root.controller.timeline
                clipId: root.panel.clipData.id || ""
                generation: root.revision
                onPatch: patch => root.controller.timeline.applyEdit("patchClipAudioEffect", {clipId: root.panel.clipData.id, effectId: root.group.effectId, patch: patch})
            }
        }
    }
}

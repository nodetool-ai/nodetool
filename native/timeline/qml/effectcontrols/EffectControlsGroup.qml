pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../../src/edit/clipeffects" as ClipFx
import "../../src/edit/clipeffects/ClipEffectsCatalog.js" as Catalog
import "../Inspector/AudioEffectsKnobs.js" as AudioKnobs
// One collapsible block: a fixed effect (Motion, Opacity, Volume), the camera of a 3D clip, or an
// effect on the clip's chain.
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
    readonly property bool switchable: group.kind !== "camera"
    readonly property bool groupOn: {
        const revision = root.revision
        if (group.kind === "fixed") return controller.groupEnabled(group.id)
        if (group.kind === "camera") return true
        return effect.enabled === true
    }
    property bool open: true
    function setOn(on) {
        if (group.kind === "fixed") {
            panel.clearSelection()
            controller.write({action: "bypass", group: group.id, enabled: on})
        } else if (group.kind === "effect") {
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
                onClicked: root.open = !root.open
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
                objectName: "effectControlsOpenColor_" + root.group.effectId
                visible: root.group.kind === "effect" && Catalog.gradedInColorPanel(root.group.effectType)
                Layout.preferredWidth: Ui.Metrics.iconLg
                Layout.preferredHeight: Ui.Metrics.iconLg
                iconName: "brightness"
                accessibleName: "Open " + root.label + " in the Color panel"
                description: accessibleName
                onClicked: root.panel.revealPanel("color")
            }
        }
        Ui.Separator { y: parent.height - height; width: parent.width }
    }
    Column {
        width: root.width
        visible: root.open
        Repeater {
            model: root.group.rows
            delegate: EffectControlsRow {
                required property var modelData
                width: root.width
                panel: root.panel
                row: modelData
                bypassed: !root.groupOn
            }
        }
        Loader {
            objectName: "effectControlsVolume"
            active: root.group.id === "volume"
            visible: active
            x: Ui.Metrics.md
            width: root.panel.listWidth - x - Ui.Metrics.md
            sourceComponent: InspectorRow {
                label: "Level"
                InspectorPillInput {
                    objectName: "effectControlsVolumeInput"
                    readonly property var read: { const revision = root.revision; return root.controller.clip }
                    readonly property var held: (read.bypassedFixedEffects || {}).volume
                    value: ((held ? held.volumeDb : read.volumeDb) || 0).toFixed(1)
                    unit: "dB"
                    minWidth: Ui.Metrics.touch * 1.5
                    ariaLabel: "Clip volume in decibels"
                    disabled: root.panel.locked || !root.groupOn
                    scrub: ({step: 0.1, min: -60, max: 12})
                    onCommit: raw => {
                        const value = Number(raw)
                        if (raw.trim() !== "" && Number.isFinite(value)) root.controller.timeline.applyEdit("setClipAudio", {clipId: root.panel.clipData.id, field: "volumeDb", value: value})
                    }
                }
            }
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

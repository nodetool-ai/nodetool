pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "EffectMaskEdits.js" as MaskEdits
// The mask rows of one grade effect, in Effect Controls and the Color panel. A mask is created
// centred on the clip, or drawn on the Program monitor with the pen. Selecting a row shows its
// path on the monitor for editing. Each slider drag or button press is one undo entry.
Column {
    id: root
    required property var editor
    required property string effectId
    readonly property var effect: editor.effects.find(effect => effect.id === effectId) || ({})
    readonly property var masks: effect.masks || []
    readonly property string clipId: editor.clip.id || ""
    readonly property bool selectedHere: ClipEffectsUi.maskClipId === clipId && ClipEffectsUi.maskEffectId === effectId
    objectName: "effectMasks_" + effectId
    spacing: Ui.Metrics.micro
    function write(next, phase = "apply") { editor.patch(effectId, {masks: next.length > 0 ? next : undefined}, phase) }
    function create(shape) {
        if (editor.locked)
            return;
        if (shape === "bezier") {
            ClipEffectsUi.selectMask(clipId, effectId, "", true);
            return;
        }
        const id = ClipEffectsUi.newId();
        write(MaskEdits.add(masks, shape, id));
        ClipEffectsUi.selectMask(clipId, effectId, id, false);
    }
    function removeMask(id) {
        write(MaskEdits.remove(masks, id));
        if (selectedHere && ClipEffectsUi.maskId === id)
            ClipEffectsUi.clearMaskSelection();
    }
    RowLayout {
        width: root.width
        spacing: Ui.Metrics.micro
        Ui.Text {
            Layout.fillWidth: true
            text: "Masks"
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
        Repeater {
            model: [{shape: "ellipse", label: "Ellipse"}, {shape: "polygon", label: "Polygon"}, {shape: "bezier", label: "Pen"}]
            delegate: Ui.EditorButton {
                required property var modelData
                objectName: "effectMasks_" + root.effectId + "_create_" + modelData.shape
                text: modelData.label
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                enabled: !root.editor.locked
                active: modelData.shape === "bezier" && root.selectedHere && ClipEffectsUi.maskPen
                accessibleName: modelData.shape === "bezier" ? "Draw a mask with the pen" : "Create " + modelData.label.toLowerCase() + " mask"
                description: modelData.shape === "bezier" ? "Click on the Program monitor to place vertices. Click the first vertex or press Enter to close." : "Create a " + modelData.label.toLowerCase() + " mask at the centre of the clip."
                onClicked: root.create(modelData.shape)
            }
        }
    }
    Repeater {
        model: root.masks
        delegate: Column {
            id: maskRow
            required property var modelData
            required property int index
            readonly property var mask: modelData
            readonly property bool selected: root.selectedHere && ClipEffectsUi.maskId === mask.id
            width: root.width
            spacing: Ui.Metrics.micro
            RowLayout {
                width: parent.width
                spacing: Ui.Metrics.micro
                Ui.EditorButton {
                    objectName: "effectMasks_" + root.effectId + "_select_" + maskRow.index
                    Layout.fillWidth: true
                    text: (maskRow.mask.name || ("Mask (" + (maskRow.index + 1) + ")")) + " · " + (MaskEdits.shapeLabels[maskRow.mask.shape] || maskRow.mask.shape)
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    active: maskRow.selected
                    accessibleName: "Select " + text
                    description: "Edit this mask on the Program monitor."
                    onClicked: maskRow.selected ? ClipEffectsUi.clearMaskSelection() : ClipEffectsUi.selectMask(root.clipId, root.effectId, maskRow.mask.id, false)
                }
                Ui.EditorButton {
                    objectName: "effectMasks_" + root.effectId + "_invert_" + maskRow.index
                    text: "Invert"
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    enabled: !root.editor.locked
                    active: maskRow.mask.inverted === true
                    accessibleName: "Invert " + (maskRow.mask.name || "mask")
                    description: "Apply the effect outside the mask instead of inside."
                    onClicked: root.write(MaskEdits.patch(root.masks, maskRow.mask.id, {inverted: !maskRow.mask.inverted}))
                }
                Ui.Select {
                    objectName: "effectMasks_" + root.effectId + "_mode_" + maskRow.index
                    Layout.preferredWidth: Ui.Metrics.xl * 4
                    density: Ui.EditorButton.Compact
                    options: MaskEdits.modes
                    value: maskRow.mask.mode || "add"
                    currentIndex: Math.max(0, MaskEdits.modes.findIndex(mode => mode.value === (maskRow.mask.mode || "add")))
                    enabled: !root.editor.locked
                    accessibleName: "Mask mode"
                    onValueCommitted: value => root.write(MaskEdits.patch(root.masks, maskRow.mask.id, {mode: value}))
                }
                Ui.ToolbarIconButton {
                    objectName: "effectMasks_" + root.effectId + "_remove_" + maskRow.index
                    Layout.preferredWidth: Ui.Metrics.iconLg
                    Layout.preferredHeight: Ui.Metrics.iconLg
                    enabled: !root.editor.locked
                    iconName: "deleteOutline"
                    accessibleName: "Delete " + (maskRow.mask.name || "mask")
                    description: accessibleName
                    onClicked: root.removeMask(maskRow.mask.id)
                }
            }
            Repeater {
                model: [
                    {key: "feather", label: "Mask Feather", min: 0, max: 0.5, fallback: 0, step: 0.005},
                    {key: "opacity", label: "Mask Opacity", min: 0, max: 1, fallback: 1, step: 0.01},
                    {key: "expansion", label: "Mask Expansion", min: -0.25, max: 0.25, fallback: 0, step: 0.005, origin: 0}
                ]
                delegate: InspectorSliderRow {
                    required property var modelData
                    objectName: "effectMasks_" + root.effectId + "_" + modelData.key + "_" + maskRow.index
                    width: maskRow.width
                    label: modelData.label
                    min: modelData.min
                    max: modelData.max
                    step: modelData.step
                    origin: modelData.origin
                    resetValue: modelData.fallback
                    value: maskRow.mask[modelData.key] ?? modelData.fallback
                    display: modelData.key === "opacity" ? Math.round(value * 100) + "%" : value.toFixed(3)
                    disabled: root.editor.locked
                    function changed(value) {
                        const change = {};
                        change[modelData.key] = value;
                        return MaskEdits.patch(root.masks, maskRow.mask.id, change);
                    }
                    onGestureStarted: root.editor.begin()
                    onPreview: value => root.write(changed(value), "preview")
                    onChange: value => root.write(changed(value), "commit")
                    onCanceled: root.editor.cancel()
                }
            }
        }
    }
}

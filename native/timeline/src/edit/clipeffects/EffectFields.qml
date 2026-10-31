pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "ClipEffectsCatalog.js" as Catalog
import "../inspectorsections" as Sections
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    required property var editor
    required property string effectId
    readonly property var effect: editor.effects.find(effect => effect.id === effectId) || ({})
    readonly property string effectType: effect.type || ""
    readonly property var definitions: Catalog.fields(effectType)
    spacing: Ui.Metrics.micro
    Repeater {
        model: root.definitions
        delegate: Loader {
            id: rowLoader
            required property var modelData
            width: root.width
            sourceComponent: {
                switch (modelData.kind) {
                case "slider":
                    return slider;
                case "number":
                    return number;
                case "color":
                    return color;
                case "toggle":
                    return toggle;
                case "offset":
                    return offset;
                case "triple":
                    return triple;
                }
                return null;
            }
            Component {
                id: slider
                InspectorSliderRow {
                    objectName: "effects_" + root.effectId + "_" + rowLoader.modelData.key
                    label: rowLoader.modelData.label
                    min: rowLoader.modelData.min
                    max: rowLoader.modelData.max
                    step: rowLoader.modelData.step
                    origin: rowLoader.modelData.origin
                    resetValue: rowLoader.modelData.resetValue ?? rowLoader.modelData.origin
                    value: root.effect[rowLoader.modelData.key] ?? rowLoader.modelData.fallback
                    display: value.toFixed(rowLoader.modelData.decimals ?? 2) + (rowLoader.modelData.unit || "")
                    disabled: root.editor.locked
                    onGestureStarted: root.editor.begin()
                    onPreview: value => {
                        const patch = {};
                        patch[rowLoader.modelData.key] = value;
                        root.editor.patch(root.effectId, patch, "preview");
                    }
                    onChange: value => {
                        const patch = {};
                        patch[rowLoader.modelData.key] = value;
                        root.editor.patch(root.effectId, patch, "commit");
                    }
                    onCanceled: root.editor.cancel()
                }
            }
            Component {
                id: number
                InspectorRow {
                    label: rowLoader.modelData.label
                    EffectNumber {
                        editor: root.editor
                        effectId: root.effectId
                        effect: root.effect
                        field: rowLoader.modelData.key
                        fallback: rowLoader.modelData.fallback
                        minimum: rowLoader.modelData.minimum
                        exclusiveMin: rowLoader.modelData.exclusiveMin ?? false
                        scrubMinimum: rowLoader.modelData.key === "gamma" ? 0.01 : undefined
                        fixedDecimals: rowLoader.modelData.key === "gamma"
                        numberStep: rowLoader.modelData.step
                        unit: rowLoader.modelData.key === "gamma" ? "" : "px"
                        ariaLabel: Catalog.name(root.effectType) + " " + rowLoader.modelData.label
                    }
                }
            }
            Component {
                id: color
                InspectorColour {
                    objectName: "effects_" + root.effectId + "_" + rowLoader.modelData.key
                    label: rowLoader.modelData.label
                    value: root.effect[rowLoader.modelData.key] ?? rowLoader.modelData.fallback
                    disabled: root.editor.locked
                    onCommit: value => {
                        const patch = {};
                        patch[rowLoader.modelData.key] = value;
                        root.editor.patch(root.effectId, patch);
                    }
                }
            }
            Component {
                id: toggle
                InspectorToggleRow {
                    objectName: "effects_" + root.effectId + "_" + rowLoader.modelData.key
                    label: rowLoader.modelData.label
                    checked: root.effect[rowLoader.modelData.key] ?? rowLoader.modelData.fallback
                    disabled: root.editor.locked
                    onChange: value => {
                        const patch = {};
                        patch[rowLoader.modelData.key] = value;
                        root.editor.patch(root.effectId, patch);
                    }
                }
            }
            Component {
                id: offset
                InspectorRow {
                    label: "Offset"
                    EffectNumber {
                        editor: root.editor
                        effectId: root.effectId
                        effect: root.effect
                        field: "offsetX"
                        fallback: 8
                        unit: "px"
                        minWidth: Ui.Metrics.small * 2 + Ui.Metrics.xl
                        ariaLabel: "Drop shadow offset X"
                    }
                    EffectNumber {
                        editor: root.editor
                        effectId: root.effectId
                        effect: root.effect
                        field: "offsetY"
                        fallback: 8
                        unit: "px"
                        minWidth: Ui.Metrics.small * 2 + Ui.Metrics.xl
                        ariaLabel: "Drop shadow offset Y"
                    }
                }
            }
            Component {
                id: triple
                InspectorRow {
                    label: rowLoader.modelData.label
                    Repeater {
                        model: ["R", "G", "B"]
                        delegate: EffectNumber {
                            required property int index
                            required property string modelData
                            editor: root.editor
                            effectId: root.effectId
                            effect: root.effect
                            field: rowLoader.modelData.key
                            channelIndex: index
                            fallback: rowLoader.modelData.key === "lift" ? 0 : 1
                            minimum: rowLoader.modelData.key === "lift" ? undefined : 0
                            exclusiveMin: rowLoader.modelData.key === "gamma"
                            scrubMinimum: rowLoader.modelData.key === "gamma" ? 0.01 : rowLoader.modelData.key === "gain" ? 0 : undefined
                            numberStep: 0.01
                            fixedDecimals: true
                            minWidth: Ui.Metrics.small * 2 + Ui.Metrics.xs
                            ariaLabel: Catalog.name(root.effectType) + " " + rowLoader.modelData.label + " " + modelData
                        }
                    }
                }
            }
        }
    }
    ToneCurveEditor {
        width: parent.width
        visible: root.effectType === "curves"
        height: visible ? implicitHeight : 0
        master: root.effect.master || []
        r: root.effect.r
        g: root.effect.g
        b: root.effect.b
        disabled: root.editor.locked
        onGestureStarted: root.editor.begin()
        onGestureCancelled: root.editor.cancel()
        onPatch: (change, phase) => root.editor.patch(root.effectId, change, phase)
    }
    Sections.InspectorCaption {
        visible: root.definitions.length === 0 && root.effectType !== "curves"
        width: parent.width
        text: Catalog.known(root.effectType) ? "This effect still applies. Use the Color section to adjust color." : 'This build does not draw "' + root.effectType + '". Its settings are kept as written.'
    }
}

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
    // Keyed fields are rows above these, with their lanes.
    readonly property var allDefinitions: Catalog.fields(effectType)
    readonly property var definitions: allDefinitions.filter(field => !Catalog.keyed(effectType, field))
    Component.onDestruction: if (root.editor?.matteEffectId === root.effectId) root.editor.clearMatte()
    spacing: Ui.Metrics.micro
    ClipAnalysisController {
        id: analysis
        objectName: "effects_" + root.effectId + "_analysisController"
        model: root.editor.timelineModel
        clipId: root.editor.clip.id || ""
        effectId: root.effectId
        locked: root.editor.locked
    }
    Ui.EditorButton {
        objectName: "effects_" + root.effectId + "_analyze"
        visible: root.effectType === "deflicker" || root.effectType === "stabilize"
        text: analysis.busy ? "Cancel analysis" : "Analyze source"
        description: "Analyze the original video. The completed result can be undone."
        density: Ui.EditorButton.Compact
        enabled: !root.editor.locked && root.editor.clip.mediaType === "video"
        onClicked: analysis.busy ? analysis.cancel() : analysis.analyze()
    }
    Sections.InspectorCaption {
        objectName: "effects_" + root.effectId + "_analysisStatus"
        visible: root.effectType === "deflicker" || root.effectType === "stabilize"
        width: parent.width
        text: analysis.status
    }
    Ui.EditorButton {
        objectName: "effects_" + root.effectId + "_softPreset"
        text: "Soft centered oval"
        description: "Extend the feather through the corners. Keep the current amount."
        density: Ui.EditorButton.Compact
        visible: root.effectType === "vignette"
        enabled: !root.editor.locked
        onClicked: root.editor.patch(root.effectId, Catalog.softVignette)
    }
    Ui.EditorButton {
        objectName: "effects_" + root.effectId + "_matte"
        text: root.editor.matteEffectId === root.effectId ? "Hide selection matte" : "Show selection matte"
        description: "View this clip's qualification mask. The matte is not saved or exported."
        density: Ui.EditorButton.Compact
        visible: root.effectType === "secondaryColor"
        enabled: !root.editor.locked && !!root.effect.enabled
        active: root.editor.matteEffectId === root.effectId
        onClicked: root.editor.toggleMatte(root.effectId)
        Keys.onEscapePressed: root.editor.clearMatte()
    }
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
                    disabled: root.editor.locked || (!!rowLoader.modelData.videoOnly && root.editor.clip?.mediaType !== "video")
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
        visible: root.effectType === "curves" || root.effectType === "secondaryColor"
        objectName: cyclic ? "effects_" + root.effectId + "_secondaryCurves" : ""
        cyclic: root.effectType === "secondaryColor"
        hueCurve: root.effect.hueCurve
        saturationCurve: root.effect.saturationCurve
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
        visible: root.allDefinitions.length === 0 && root.effectType !== "curves"
        width: parent.width
        text: Catalog.readOnlyDescription(root.effectType)
    }
}

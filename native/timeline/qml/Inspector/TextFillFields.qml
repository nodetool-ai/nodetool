// FillFields from InspectorMotionFields. Text prefix matches package I's owns pattern.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../../src/edit/inspectorsections" as Sections
import "primitives/InspectorPrimitivesHelpers.js" as Helpers
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    required property var editor
    required property string field
    required property string labelPrefix
    required property string namePrefix
    readonly property var fill: editor.style[field]
    spacing: Ui.Metrics.xs
    function typeChange(type) {
        if (type === "none") {
            editor.set(field, undefined);
            return;
        }
        if (type === "solid") {
            editor.set(field, {
                type,
                color: fill?.type === "solid" ? fill.color : "#ffffff"
            });
            return;
        }
        const stops = fill && fill.type !== "solid" ? fill.stops : [
            {
                offset: 0,
                color: "#000000"
            },
            {
                offset: 1,
                color: "#ffffff"
            }
        ];
        editor.set(field, type === "linear" ? {
            type,
            angle: fill?.type === "linear" ? fill.angle : 0,
            stops
        } : {
            type,
            stops
        });
    }
    InspectorRow {
        width: parent.width
        label: "Fill"
        InspectorSelect {
            objectName: root.namePrefix + "FillType"
            label: root.labelPrefix + " type"
            value: root.fill?.type ?? "none"
            disabled: root.editor.locked
            options: [
                {
                    value: "none",
                    label: "None"
                },
                {
                    value: "solid",
                    label: "Solid"
                },
                {
                    value: "linear",
                    label: "Linear gradient"
                },
                {
                    value: "radial",
                    label: "Radial gradient"
                }
            ]
            onChange: next => root.typeChange(next)
        }
    }
    InspectorColour {
        width: parent.width
        objectName: root.namePrefix + "FillSolid"
        label: "Fill color"
        visible: root.fill?.type === "solid"
        value: root.fill?.color ?? "#ffffff"
        disabled: root.editor.locked
        onCommit: next => root.editor.set(root.field, {
                type: "solid",
                color: next
            })
    }
    InspectorRow {
        width: parent.width
        label: "Angle"
        visible: root.fill?.type === "linear"
        InspectorPillInput {
            objectName: root.namePrefix + "FillAngle"
            ariaLabel: root.labelPrefix + " angle"
            value: String(root.fill?.angle ?? 0)
            unit: "°"
            disabled: root.editor.locked
            onCommit: raw => {
                const angle = Number(raw);
                if (Number.isFinite(angle))
                    root.editor.set(root.field, {
                        type: "linear",
                        angle,
                        stops: root.fill.stops
                    });
            }
        }
    }
    InspectorRow {
        width: parent.width
        label: "Stops"
        visible: !!root.fill && root.fill.type !== "solid"
        InspectorPillInput {
            objectName: root.namePrefix + "FillStops"
            ariaLabel: root.labelPrefix + " stops"
            value: Helpers.formatGradientStops(root.fill?.stops)
            allowEmpty: true
            disabled: root.editor.locked
            onCommit: raw => {
                const stops = Helpers.parseGradientStops(raw);
                if (stops === null || stops.length === 0 || !root.fill || root.fill.type === "solid")
                    return;
                root.editor.set(root.field, root.fill.type === "linear" ? {
                    type: "linear",
                    angle: root.fill.angle,
                    stops
                } : {
                    type: "radial",
                    stops
                });
            }
        }
    }
    Sections.InspectorCaption {
        visible: !!root.fill && root.fill.type !== "solid"
        text: "Enter offset:color pairs, for example 0:#000000, 1:#ffffff."
    }
}

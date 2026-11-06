// ClipShapeSection from the web. The native name matches package I's owns pattern.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../../src/edit/inspectorsections" as Sections
import "primitives/InspectorPrimitivesHelpers.js" as Helpers
import NodeTool.UiPrimitives as Ui

InspectorSection {
    id: root
    objectName: "inspectorShape"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: controller ? controller.clip : ({})
    readonly property var style: styleEdits.style
    readonly property bool locked: styleEdits.locked
    title: "Shape"
    defaultOpen: false
    visible: clip.mediaType === "shape" && !!clip.shapeStyle && clip.sourceType !== "generated"
    TextStyleEdits {
        id: styleEdits
        timelineModel: root.timelineModel
        controller: root.controller
        styleKey: "shapeStyle"
    }
    readonly property string kind: style.kind ?? "rect"
    InspectorRow {
        width: parent.width
        label: "Kind"
        InspectorSelect {
            objectName: "shapeKind"
            label: "Shape kind"
            value: root.kind
            options: [
                {
                    value: "rect",
                    label: "Rectangle"
                },
                {
                    value: "ellipse",
                    label: "Ellipse"
                },
                {
                    value: "line",
                    label: "Line"
                },
                {
                    value: "path",
                    label: "Path"
                },
                {
                    value: "polygon",
                    label: "Polygon"
                },
                {
                    value: "star",
                    label: "Star"
                }
            ]
            disabled: root.locked
            onChange: next => styleEdits.set("kind", next)
        }
    }
    InspectorRow {
        width: parent.width
        label: "Position"
        visible: root.kind !== "line" && root.kind !== "path"
        TextStyleNumber {
            objectName: "shapeX"
            editor: styleEdits
            field: "x"
            value: (root.style.x ?? 0).toFixed(2)
            ariaLabel: "Shape X"
            scrub: ({
                    step: 0.01
                })
            minimum: -Infinity
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
        TextStyleNumber {
            objectName: "shapeY"
            editor: styleEdits
            field: "y"
            value: (root.style.y ?? 0).toFixed(2)
            ariaLabel: "Shape Y"
            scrub: ({
                    step: 0.01
                })
            minimum: -Infinity
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
    }
    InspectorRow {
        width: parent.width
        label: "Size"
        visible: root.kind !== "line" && root.kind !== "path"
        TextStyleNumber {
            objectName: "shapeWidth"
            editor: styleEdits
            field: "width"
            value: (root.style.width ?? 0).toFixed(2)
            ariaLabel: "Shape width"
            scrub: ({
                    step: 0.01
                })
            minimum: 0
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
        TextStyleNumber {
            objectName: "shapeHeight"
            editor: styleEdits
            field: "height"
            value: (root.style.height ?? 0).toFixed(2)
            ariaLabel: "Shape height"
            scrub: ({
                    step: 0.01
                })
            minimum: 0
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
    }
    InspectorRow {
        width: parent.width
        label: "Start"
        visible: root.kind === "line"
        TextStyleNumber {
            objectName: "shapeLineX"
            editor: styleEdits
            field: "x"
            value: (root.style.x ?? 0).toFixed(2)
            ariaLabel: "Line start X"
            scrub: ({
                    step: 0.01
                })
            minimum: -Infinity
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
        TextStyleNumber {
            objectName: "shapeLineY"
            editor: styleEdits
            field: "y"
            value: (root.style.y ?? 0).toFixed(2)
            ariaLabel: "Line start Y"
            scrub: ({
                    step: 0.01
                })
            minimum: -Infinity
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
    }
    InspectorRow {
        width: parent.width
        label: "End"
        visible: root.kind === "line"
        TextStyleNumber {
            objectName: "shapeX2"
            editor: styleEdits
            field: "x2"
            value: (root.style.x2 ?? 0).toFixed(2)
            ariaLabel: "Line end X"
            scrub: ({
                    step: 0.01
                })
            minimum: -Infinity
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
        TextStyleNumber {
            objectName: "shapeY2"
            editor: styleEdits
            field: "y2"
            value: (root.style.y2 ?? 0).toFixed(2)
            ariaLabel: "Line end Y"
            scrub: ({
                    step: 0.01
                })
            minimum: -Infinity
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
    }
    InspectorRow {
        width: parent.width
        label: "Path"
        visible: root.kind === "path"
        InspectorPillInput {
            objectName: "shapePath"
            value: root.style.d ?? ""
            ariaLabel: "Shape path data"
            placeholder: "M 0 0 L 1 0 L 1 1 Z"
            allowEmpty: true
            disabled: root.locked
            onCommit: raw => styleEdits.set("d", raw.trim() || undefined)
        }
    }
    Sections.InspectorCaption {
        visible: root.kind === "path"
        text: "SVG path data in normalized 0..1 space. M, L, C, Q and Z."
    }
    InspectorRow {
        width: parent.width
        label: "Points"
        visible: root.kind === "polygon" || root.kind === "star"
        TextStyleNumber {
            objectName: "shapeSides"
            editor: styleEdits
            field: "sides"
            value: String(root.style.sides ?? 5)
            ariaLabel: "Shape point count"
            minimum: 3
            rounded: true
            scrub: ({
                    step: 1,
                    min: 3
                })
        }
    }
    InspectorSliderRow {
        width: parent.width
        objectName: "shapeInnerRadius"
        label: "Inner radius"
        visible: root.kind === "star"
        min: 0
        max: 1
        step: 0.01
        value: root.style.innerRadius ?? 0.5
        display: value.toFixed(2)
        disabled: root.locked
        resetValue: 0.5
        onGestureStarted: styleEdits.begin()
        onPreview: next => styleEdits.set("innerRadius", next, true)
        onChange: next => styleEdits.set("innerRadius", next)
        onCanceled: styleEdits.edits.cancelGesture()
    }
    InspectorRow {
        width: parent.width
        label: "Corner radius"
        visible: root.kind === "rect"
        TextStyleNumber {
            objectName: "shapeCornerRadius"
            editor: styleEdits
            field: "cornerRadius"
            value: (root.style.cornerRadius ?? 0).toFixed(3)
            ariaLabel: "Corner radius"
            minimum: 0
            scrub: ({
                    step: 0.01
                })
        }
    }
    InspectorColour {
        width: parent.width
        objectName: "shapeFillColor"
        label: "Fill color"
        value: typeof root.style.fill === "string" ? root.style.fill : "#ffffff"
        disabled: root.locked
        onCommit: next => styleEdits.set("fill", next)
    }
    TextFillFields {
        width: parent.width
        editor: styleEdits
        field: "fillStyle"
        labelPrefix: "Shape fill"
        namePrefix: "shape"
    }
    InspectorColour {
        width: parent.width
        objectName: "shapeStrokeColor"
        label: "Stroke color"
        value: root.style.stroke ?? "#000000"
        disabled: root.locked
        onCommit: next => styleEdits.set("stroke", next)
    }
    InspectorRow {
        width: parent.width
        label: "Stroke width"
        TextStyleNumber {
            objectName: "shapeStrokeWidth"
            editor: styleEdits
            field: "strokeWidthPx"
            value: String(root.style.strokeWidthPx ?? 0)
            ariaLabel: "Stroke width"
            unit: "px"
            minimum: 0
            scrub: ({
                    step: 1,
                    min: 0
                })
        }
    }
    InspectorRow {
        width: parent.width
        label: "Dash"
        InspectorPillInput {
            objectName: "shapeDash"
            value: Helpers.formatNumberList(root.style.dash)
            ariaLabel: "Shape dash pattern"
            placeholder: "0.02, 0.01"
            allowEmpty: true
            disabled: root.locked
            onCommit: raw => {
                const dash = Helpers.parseNumberList(raw);
                if (dash !== null)
                    styleEdits.set("dash", dash.length ? dash : undefined);
            }
        }
    }
    InspectorRow {
        width: parent.width
        label: "Cap"
        InspectorSelect {
            objectName: "shapeCap"
            label: "Shape line cap"
            value: root.style.lineCap ?? "butt"
            options: [
                {
                    value: "butt",
                    label: "Butt"
                },
                {
                    value: "round",
                    label: "Round"
                },
                {
                    value: "square",
                    label: "Square"
                }
            ]
            disabled: root.locked
            onChange: next => styleEdits.set("lineCap", next)
        }
    }
    InspectorRow {
        width: parent.width
        label: "Join"
        InspectorSelect {
            objectName: "shapeJoin"
            label: "Shape line join"
            value: root.style.lineJoin ?? "miter"
            options: [
                {
                    value: "miter",
                    label: "Miter"
                },
                {
                    value: "round",
                    label: "Round"
                },
                {
                    value: "bevel",
                    label: "Bevel"
                }
            ]
            disabled: root.locked
            onChange: next => styleEdits.set("lineJoin", next)
        }
    }
    InspectorSliderRow {
        width: parent.width
        objectName: "shapeTrimStart"
        label: "Trim start"
        visible: true
        min: 0
        max: 1
        step: 0.01
        value: root.style.trimStart ?? 0
        display: value.toFixed(2)
        disabled: root.locked
        origin: 0
        onGestureStarted: styleEdits.begin()
        onPreview: next => styleEdits.set("trimStart", next, true)
        onChange: next => styleEdits.set("trimStart", next)
        onCanceled: styleEdits.edits.cancelGesture()
    }
    InspectorSliderRow {
        width: parent.width
        objectName: "shapeTrimEnd"
        label: "Trim end"
        visible: true
        min: 0
        max: 1
        step: 0.01
        value: root.style.trimEnd ?? 1
        display: value.toFixed(2)
        disabled: root.locked
        resetValue: 1
        onGestureStarted: styleEdits.begin()
        onPreview: next => styleEdits.set("trimEnd", next, true)
        onChange: next => styleEdits.set("trimEnd", next)
        onCanceled: styleEdits.edits.cancelGesture()
    }
}

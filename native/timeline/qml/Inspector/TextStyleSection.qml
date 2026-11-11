// ClipTextStyleSection from the web. The native name matches package I's owns pattern.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "../../src/edit/inspectorsections" as Sections
import NodeTool.UiPrimitives as Ui

InspectorSection {
    id: root
    objectName: "inspectorText"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: controller ? controller.clip : ({})
    readonly property var style: styleEdits.style
    readonly property bool locked: styleEdits.locked
    title: "Text"
    defaultOpen: false
    visible: clip.mediaType === "text" && !!clip.textStyle && clip.sourceType !== "generated"
    TextStyleEdits {
        id: styleEdits
        timelineModel: root.timelineModel
        controller: root.controller
        styleKey: "textStyle"
    }
    TextContentInput {
        objectName: "textContent"
        width: parent.width
        editor: styleEdits
        value: root.style.text ?? ""
    }
    InspectorRow {
        width: parent.width
        label: "Font"
        TextFontPicker {
            objectName: "textFont"
            label: "Text font family"
            value: root.style.fontFamily ?? ""
            disabled: root.locked
            onChange: next => styleEdits.set("fontFamily", next || undefined)
        }
    }
    InspectorRow {
        width: parent.width
        label: "Font size"
        TextStyleNumber {
            objectName: "textSize"
            editor: styleEdits
            field: "fontSizePx"
            value: String(root.style.fontSizePx ?? 1)
            ariaLabel: "Font size"
            unit: "px"
            scrub: ({
                    step: 1
                })
            minimum: 1
        }
    }
    readonly property var weightOptions: {
        const labels = ["Thin (100)", "Extra light (200)", "Light (300)", "Regular (400)", "Medium (500)", "Semibold (600)", "Bold (700)", "Extra bold (800)", "Black (900)"];
        const options = labels.map((label, i) => ({
                    value: String((i + 1) * 100),
                    label
                }));
        const weight = String(style.fontWeight ?? 400);
        if (!options.some(option => option.value === weight))
            options.push({
                value: weight,
                label: "Custom (" + weight + ")"
            });
        return options;
    }
    InspectorRow {
        width: parent.width
        label: "Weight"
        InspectorSelect {
            objectName: "textWeight"
            label: "Text font weight"
            value: String(root.style.fontWeight ?? 400)
            options: root.weightOptions
            // Observe options so selection updates when the computed model arrives after value.
            currentIndex: options.findIndex(option => option.value === value)
            disabled: root.locked
            onChange: next => styleEdits.set("fontWeight", Number(next))
        }
    }
    InspectorRow {
        width: parent.width
        label: "Style"
        InspectorSelect {
            objectName: "textStyle"
            label: "Text font style"
            value: root.style.fontStyle ?? "normal"
            options: [
                {
                    value: "normal",
                    label: "Normal"
                },
                {
                    value: "italic",
                    label: "Italic"
                }
            ]
            disabled: root.locked
            onChange: next => styleEdits.set("fontStyle", next)
        }
    }
    InspectorColour {
        width: parent.width
        objectName: "textColor"
        label: "Color"
        value: root.style.color ?? "#ffffff"
        disabled: root.locked
        onCommit: next => styleEdits.set("color", next)
    }
    InspectorRow {
        width: parent.width
        label: "Align"
        InspectorSelect {
            objectName: "textAlign"
            label: "Text alignment"
            value: root.style.align ?? "center"
            options: [
                {
                    value: "left",
                    label: "Left"
                },
                {
                    value: "center",
                    label: "Center"
                },
                {
                    value: "right",
                    label: "Right"
                }
            ]
            disabled: root.locked
            onChange: next => styleEdits.set("align", next)
        }
    }
    InspectorRow {
        width: parent.width
        label: "Vertical align"
        InspectorSelect {
            objectName: "textVerticalAlign"
            label: "Text vertical alignment"
            value: root.style.verticalAlign ?? "middle"
            options: [
                {
                    value: "top",
                    label: "Top"
                },
                {
                    value: "middle",
                    label: "Middle"
                },
                {
                    value: "bottom",
                    label: "Bottom"
                }
            ]
            disabled: root.locked
            onChange: next => styleEdits.set("verticalAlign", next)
        }
    }
    InspectorRow {
        width: parent.width
        label: "Letter spacing"
        TextStyleNumber {
            objectName: "textLetterSpacing"
            editor: styleEdits
            field: "letterSpacingPx"
            value: String(root.style.letterSpacingPx ?? 0)
            ariaLabel: "Letter spacing"
            unit: "px"
            scrub: ({
                    step: 1
                })
        }
    }
    InspectorRow {
        width: parent.width
        label: "Line height"
        TextStyleNumber {
            objectName: "textLineHeight"
            editor: styleEdits
            field: "lineHeight"
            value: (root.style.lineHeight ?? 1.2).toFixed(2)
            ariaLabel: "Line height"
            unit: "×"
            scrub: ({
                    step: 0.01,
                    min: 0
                })
            minimum: 0
            exclusiveMinimum: true
        }
    }
    InspectorToggleRow {
        objectName: "textStrikethrough"
        width: parent.width
        label: "Strikethrough"
        checked: root.style.strikethrough === true
        disabled: root.locked
        onChange: next => styleEdits.set("strikethrough", next ? true : undefined)
    }
    InspectorToggleRow {
        objectName: "textStroke"
        width: parent.width
        label: "Stroke"
        checked: root.style.stroke !== undefined
        disabled: root.locked
        onChange: next => styleEdits.set("stroke", next ? {
                color: "#000000",
                widthPx: 2
            } : undefined)
    }
    InspectorColour {
        width: parent.width
        objectName: "textStrokeColor"
        label: "Text stroke color"
        value: root.style.stroke?.color ?? "#000000"
        disabled: root.locked
        visible: !!root.style.stroke
        onCommit: next => styleEdits.set("stroke.color", next)
    }
    InspectorRow {
        width: parent.width
        label: "Stroke width"
        visible: !!root.style.stroke
        TextStyleNumber {
            objectName: "textStrokeWidth"
            editor: styleEdits
            field: "stroke.widthPx"
            value: String(root.style.stroke?.widthPx ?? 2)
            ariaLabel: "Stroke width"
            unit: "px"
            scrub: ({
                    step: 1
                })
            minimum: 0
        }
    }
    InspectorToggleRow {
        objectName: "textShadow"
        width: parent.width
        label: "Shadow"
        checked: root.style.shadow !== undefined
        disabled: root.locked
        onChange: next => styleEdits.set("shadow", next ? {
                color: "#000000",
                blurPx: 8,
                offsetX: 0,
                offsetY: 4
            } : undefined)
    }
    InspectorColour {
        width: parent.width
        objectName: "textShadowColor"
        label: "Shadow color"
        value: root.style.shadow?.color ?? "#000000"
        disabled: root.locked
        visible: !!root.style.shadow
        onCommit: next => styleEdits.set("shadow.color", next)
    }
    InspectorRow {
        width: parent.width
        label: "Shadow blur"
        visible: !!root.style.shadow
        TextStyleNumber {
            objectName: "textShadowBlur"
            editor: styleEdits
            field: "shadow.blurPx"
            value: String(root.style.shadow?.blurPx ?? 8)
            ariaLabel: "Shadow blur"
            unit: "px"
            scrub: ({
                    step: 1
                })
            minimum: 0
        }
    }
    InspectorRow {
        width: parent.width
        label: "Shadow offset"
        visible: !!root.style.shadow
        TextStyleNumber {
            objectName: "textShadowX"
            editor: styleEdits
            field: "shadow.offsetX"
            value: String(root.style.shadow?.offsetX ?? 0)
            ariaLabel: "Text shadow offset X"
            unit: "px"
            scrub: ({
                    step: 1
                })
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
        TextStyleNumber {
            objectName: "textShadowY"
            editor: styleEdits
            field: "shadow.offsetY"
            value: String(root.style.shadow?.offsetY ?? 4)
            ariaLabel: "Text shadow offset Y"
            unit: "px"
            scrub: ({
                    step: 1
                })
            minWidth: Ui.Metrics.small + InspectorTokens.controlXl - Ui.Metrics.xs
        }
    }
    InspectorToggleRow {
        objectName: "textBackground"
        width: parent.width
        label: "Background"
        checked: root.style.background !== undefined
        disabled: root.locked
        onChange: next => styleEdits.set("background", next ? {
                color: "#000000",
                paddingPx: 16,
                radiusPx: 8
            } : undefined)
    }
    InspectorColour {
        width: parent.width
        objectName: "textBackgroundColor"
        label: "Background color"
        value: root.style.background?.color ?? "#000000"
        disabled: root.locked
        visible: !!root.style.background
        onCommit: next => styleEdits.set("background.color", next)
    }
    InspectorRow {
        width: parent.width
        label: "Background padding"
        visible: !!root.style.background
        TextStyleNumber {
            objectName: "textBackgroundPadding"
            editor: styleEdits
            field: "background.paddingPx"
            value: String(root.style.background?.paddingPx ?? 16)
            ariaLabel: "Background padding"
            unit: "px"
            scrub: ({
                    step: 1
                })
            minimum: 0
        }
    }
    InspectorRow {
        width: parent.width
        label: "Background radius"
        visible: !!root.style.background
        TextStyleNumber {
            objectName: "textBackgroundRadius"
            editor: styleEdits
            field: "background.radiusPx"
            value: String(root.style.background?.radiusPx ?? 0)
            ariaLabel: "Background radius"
            unit: "px"
            scrub: ({
                    step: 1
                })
            minimum: 0
        }
    }
    TextFillFields {
        width: parent.width
        editor: styleEdits
        field: "fill"
        labelPrefix: "Text fill"
        namePrefix: "text"
    }
    Sections.InspectorCaption {
        text: "A gradient fill is drawn instead of the color above."
    }
}

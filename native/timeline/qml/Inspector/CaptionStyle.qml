// ClipCaptionStyle from the web. The native name matches package I's owns pattern.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

InspectorSection {
    id: root
    objectName: "inspectorCaption"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: controller ? controller.clip : ({})
    readonly property var style: styleEdits.style
    readonly property bool locked: styleEdits.locked
    title: "Caption"
    defaultOpen: false
    visible: !!clip.caption && clip.mediaType !== "group" && clip.mediaType !== "adjustment" && clip.sourceType !== "generated"
    TextStyleEdits {
        id: styleEdits
        timelineModel: root.timelineModel
        controller: root.controller
        styleKey: "caption"
    }
    function percent(value) {
        return value === undefined ? "" : String(Number((value * 100).toFixed(2)));
    }
    function outline(raw) {
        if (raw.trim() === "") {
            styleEdits.set("outline", undefined);
            return;
        }
        const widthPx = Number(raw);
        if (Number.isFinite(widthPx) && widthPx >= 0)
            styleEdits.set("outline", {
                color: style.outline?.color ?? "#000000",
                widthPx
            });
    }
    function scrim(raw) {
        if (raw.trim() === "") {
            styleEdits.set("background", undefined);
            return;
        }
        const paddingPx = Number(raw);
        if (Number.isFinite(paddingPx) && paddingPx >= 0)
            styleEdits.set("background", Object.assign({}, style.background, {
                color: style.background?.color ?? "#000000",
                paddingPx
            }));
    }
    InspectorRow {
        width: parent.width
        label: "Font"
        TextFontPicker {
            objectName: "captionFont"
            label: "Caption font family"
            value: root.style.fontFamily ?? ""
            disabled: root.locked
            onChange: next => styleEdits.set("fontFamily", next || undefined)
        }
    }
    InspectorRow {
        width: parent.width
        label: "Size"
        TextStyleNumber {
            objectName: "captionSize"
            editor: styleEdits
            field: "fontSizeFrac"
            value: root.percent(root.style.fontSizeFrac)
            ariaLabel: "Caption size as a percentage of frame height"
            unit: "%"
            placeholder: "5"
            allowEmpty: true
            minimum: 0
            scale: 0.01
        }
    }
    InspectorColour {
        width: parent.width
        objectName: "captionColor"
        label: "Color"
        value: root.style.color ?? "#FFFFFF"
        disabled: root.locked
        onCommit: next => styleEdits.set("color", next)
    }
    InspectorColour {
        width: parent.width
        objectName: "captionSpoken"
        label: "Spoken"
        value: root.style.activeColor ?? "#FFD60A"
        disabled: root.locked
        onCommit: next => styleEdits.set("activeColor", next)
    }
    InspectorRow {
        width: parent.width
        label: "Bottom"
        TextStyleNumber {
            objectName: "captionBottom"
            editor: styleEdits
            field: "bottomMarginFrac"
            value: root.percent(root.style.bottomMarginFrac)
            ariaLabel: "Caption distance from the frame bottom"
            unit: "%"
            placeholder: "12"
            allowEmpty: true
            minimum: 0
            scale: 0.01
        }
    }
    InspectorRow {
        width: parent.width
        label: "Outline"
        InspectorPillInput {
            objectName: "captionOutline"
            value: root.style.outline ? String(root.style.outline.widthPx) : ""
            unit: "px"
            placeholder: "auto"
            allowEmpty: true
            ariaLabel: "Caption outline width"
            disabled: root.locked
            onCommit: raw => root.outline(raw)
        }
    }
    InspectorColour {
        objectName: "captionOutlineColor"
        width: parent.width
        label: "Outline color"
        value: root.style.outline?.color ?? "#000000"
        visible: !!root.style.outline
        disabled: root.locked
        onCommit: next => styleEdits.set("outline", {
                color: next,
                widthPx: root.style.outline.widthPx
            })
    }
    InspectorRow {
        width: parent.width
        label: "Scrim"
        InspectorPillInput {
            objectName: "captionScrim"
            value: root.style.background ? String(root.style.background.paddingPx) : ""
            unit: "px"
            placeholder: "none"
            allowEmpty: true
            ariaLabel: "Caption scrim padding"
            disabled: root.locked
            onCommit: raw => root.scrim(raw)
        }
    }
    InspectorColour {
        width: parent.width
        objectName: "captionScrimColor"
        label: "Scrim color"
        value: root.style.background?.color ?? "#000000"
        disabled: root.locked
        visible: !!root.style.background
        onCommit: next => styleEdits.set("background.color", next)
    }
    InspectorRow {
        width: parent.width
        label: "Scrim radius"
        visible: !!root.style.background
        InspectorPillInput {
            objectName: "captionScrimRadius"
            value: String(root.style.background?.radiusPx ?? 0)
            unit: "px"
            ariaLabel: "Caption scrim corner radius"
            disabled: root.locked
            onCommit: raw => {
                const radiusPx = Number(raw);
                if (Number.isFinite(radiusPx) && radiusPx >= 0)
                    styleEdits.set("background.radiusPx", radiusPx);
            }
        }
    }
}

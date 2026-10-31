pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "ClipEffectsCatalog.js" as Catalog

// Render and Transform are supplied by the merged Inspector. D6 owns Color.
InspectorSection {
    id: root
    objectName: "clipAdjustments"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    readonly property var clip: editor.clip
    title: "Color"
    icon: Icons.sunny
    checkable: true
    checked: editor.color?.enabled ?? false
    checkboxDisabled: editor.locked
    defaultOpen: false
    open: ClipEffectsUi.folds.color ?? false
    visible: editor.visual
    action: ({
            icon: Icons.restartAlt,
            label: "Reset color",
            disabled: !editor.color || editor.locked,
            onClick: () => editor.resetColor()
        })
    onCheckedChangedByUser: next => editor.updateColor({
            enabled: next
        })
    onToggled: next => ClipEffectsUi.setFold("color", next)
    ClipEffectsEdits {
        id: editor
        timelineModel: root.timelineModel
        controller: root.controller
    }
    Connections {
        target: ClipEffectsUi
        function onFoldsChanged() {
            root.open = ClipEffectsUi.folds.color ?? false;
        }
    }
    Repeater {
        model: Catalog.colorFields
        delegate: InspectorSliderRow {
            required property var modelData
            objectName: "adjust" + modelData.key.charAt(0).toUpperCase() + modelData.key.slice(1)
            width: parent.width
            label: modelData.label
            min: modelData.min
            max: modelData.max
            step: modelData.step
            origin: modelData.origin
            value: editor.color?.[modelData.key] ?? modelData.origin
            display: modelData.key === "hue" ? value.toFixed(0) + "°" : value.toFixed(2)
            disabled: editor.locked || !root.checked
            onGestureStarted: editor.begin()
            onPreview: next => {
                const change = {};
                change[modelData.key] = next;
                editor.updateColor(change, "preview");
            }
            onChange: next => {
                const change = {};
                change[modelData.key] = next;
                editor.updateColor(change, "commit");
            }
        }
    }
}

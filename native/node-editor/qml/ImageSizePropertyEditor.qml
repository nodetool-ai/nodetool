import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "PropertyPresets.js" as Presets

ColumnLayout {
    id: root
    objectName: "image-size-editor-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    property int generation: 0
    property bool locked: false
    property real aspectRatio: 1
    readonly property var presets: Presets.imageSizes
    readonly property var current: value && typeof value === "object" ? value : ({width: 1024, height: 1024})
    readonly property var matchedPreset: presets.find(preset => preset.width === current.width && preset.height === current.height)
    signal valueCommitted(var value)
    spacing: Ui.Metrics.xs
    function validDimension(value) { return Number.isSafeInteger(value) && value > 0 }
    function commit(next) { if (writable && validDimension(next.width) && validDimension(next.height)) valueCommitted(next) }
    function setDimension(axis, value) {
        if (!writable || !validDimension(value)) return
        const next = Object.assign({}, current); next[axis] = value; delete next.preset
        if (locked) next[axis === "width" ? "height" : "width"] = Math.round(axis === "width" ? value / aspectRatio : value * aspectRatio)
        commit(next)
    }
    function choosePreset(label) {
        const preset = presets.find(preset => preset.label === label)
        if (!writable || !preset) return
        const next = Object.assign({}, current, {width: preset.width, height: preset.height, preset: preset.label})
        if (locked) aspectRatio = preset.width / preset.height
        commit(next)
    }
    function swap() {
        const next = Object.assign({}, current, {width: current.height, height: current.width}); delete next.preset
        if (locked && validDimension(next.width) && validDimension(next.height)) aspectRatio = next.width / next.height
        commit(next)
    }
    function toggleLock() {
        if (!writable || !validDimension(current.width) || !validDimension(current.height)) return
        if (!locked) aspectRatio = current.width / current.height
        locked = !locked
    }
    function cancelEdit() { ++generation; widthField.cancelEdit(); heightField.cancelEdit() }
    function resetScope() { cancelEdit(); locked = false; aspectRatio = 1 }
    RowLayout {
        spacing: Ui.Metrics.sm
        ColumnLayout {
            Layout.fillWidth: true
            Ui.Text { text: "Width"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
            Ui.NumberField {
                id: widthField
                objectName: "image-width-" + root.descriptor.name
                property int editGeneration: -1
                Layout.fillWidth: true
                value: root.validDimension(root.current.width) ? root.current.width : 0
                displayValue: root.validDimension(root.current.width) ? String(root.current.width) : ""
                accessibleName: "Image width"
                from: 1; to: Number.MAX_SAFE_INTEGER
                stepSize: 1
                enabled: root.writable
                valid: Number.isSafeInteger(Number(text))
                errorText: "Enter a positive integer width."
                onEditStarted: editGeneration = root.generation
                onValueCommitted: value => { if (editGeneration === root.generation) root.setDimension("width", value) }
            }
        }
        ColumnLayout {
            Layout.fillWidth: true
            Ui.Text { text: "Height"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
            Ui.NumberField {
                id: heightField
                objectName: "image-height-" + root.descriptor.name
                property int editGeneration: -1
                Layout.fillWidth: true
                value: root.validDimension(root.current.height) ? root.current.height : 0
                displayValue: root.validDimension(root.current.height) ? String(root.current.height) : ""
                accessibleName: "Image height"
                from: 1; to: Number.MAX_SAFE_INTEGER
                stepSize: 1
                enabled: root.writable
                valid: Number.isSafeInteger(Number(text))
                errorText: "Enter a positive integer height."
                onEditStarted: editGeneration = root.generation
                onValueCommitted: value => { if (editGeneration === root.generation) root.setDimension("height", value) }
            }
        }
    }
    RowLayout {
        spacing: Ui.Metrics.xs
        Ui.EditorButton { variant: Ui.EditorButton.Outlined; text: "Swap"; enabled: root.writable; onClicked: root.swap() }
        Ui.EditorButton { text: root.locked ? "Unlock ratio" : "Lock ratio"; enabled: root.writable; variant: Ui.EditorButton.Outlined; highlighted: root.locked; onClicked: root.toggleLock() }
    }
    Ui.Select {
        objectName: "image-size-preset-" + root.descriptor.name
        Layout.fillWidth: true
        accessibleName: "Image size preset"
        options: (root.matchedPreset ? [] : [{label: "Custom dimensions", value: "__custom__"}]).concat(root.presets.map(preset => ({label: preset.label + " · " + preset.width + " × " + preset.height, value: preset.label})))
        value: root.matchedPreset ? root.matchedPreset.label : "__custom__"
        enabled: root.writable
        onValueCommitted: value => root.choosePreset(value)
    }
    Ui.Text { visible: !!root.matchedPreset; text: root.matchedPreset ? root.matchedPreset.label + " " + root.matchedPreset.aspectRatio : ""; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
}

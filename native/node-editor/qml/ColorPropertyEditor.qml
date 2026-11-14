import QtQuick
import QtQuick.Window
import QtQuick.Layouts
import QtQuick.Dialogs
import NodeTool.UiPrimitives as Ui
import "PropertyPresets.js" as Presets

ColumnLayout {
    id: root
    objectName: "color-editor-" + descriptor.name
    required property var descriptor
    required property var value
    required property bool writable
    property int generation: 0
    property int dialogGeneration: -1
    readonly property var selected: typeof value === "string" ? value : value && value.value !== undefined ? value.value : null
    readonly property var presets: Presets.colors
    signal valueCommitted(var value)
    spacing: Ui.Metrics.xs
    function validHex(text) { return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(text) }
    function rgba(text) {
        if (!text || !validHex(text)) return "transparent"
        let hex = text.substring(1)
        if (hex.length <= 4) hex = hex.split("").map(part => part + part).join("")
        return Qt.rgba(parseInt(hex.substring(0, 2), 16) / 255, parseInt(hex.substring(2, 4), 16) / 255, parseInt(hex.substring(4, 6), 16) / 255, hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1)
    }
    function choose(text) {
        if (!writable || (text !== null && !validHex(text))) return
        const prior = value && typeof value === "object" ? value : {}
        valueCommitted(Object.assign({}, prior, {type: "color", value: text}))
    }
    function cancelEdit() { ++generation; custom.close(); hex.cancelEdit() }
    function resetScope() { cancelEdit() }
    function customColor(color) {
        const channel = value => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0")
        return "#" + channel(color.r) + channel(color.g) + channel(color.b) + (color.a < 1 ? channel(color.a) : "")
    }
    RowLayout {
        spacing: Ui.Metrics.sm
        Rectangle {
            implicitWidth: Ui.Metrics.touch
            implicitHeight: Ui.Metrics.standard
            color: root.rgba(root.selected)
            border.width: Ui.Metrics.border
            border.color: Ui.Theme.borderControl
            radius: Ui.Metrics.radiusControl
        }
        Ui.TextField {
            id: hex
            objectName: "color-hex-" + root.descriptor.name
            property int editGeneration: -1
            Layout.fillWidth: true
            value: root.selected || ""
            placeholderText: "#RRGGBB or #RRGGBBAA"
            accessibleName: "Custom color hex"
            enabled: root.writable
            valid: text === "" && !editing || root.validHex(text)
            errorText: "Enter a hex color, with optional alpha."
            onEditStarted: editGeneration = root.generation
            onValueCommitted: value => { if (editGeneration === root.generation) root.choose(value) }
        }
    }
    Flow {
        Layout.fillWidth: true
        spacing: Ui.Metrics.xs
        Repeater {
            model: root.presets
            delegate: Ui.EditorButton {
                id: swatch
                required property var modelData
                implicitWidth: Ui.Metrics.compact
                implicitHeight: Ui.Metrics.compact
                leftPadding: Ui.Metrics.micro; rightPadding: Ui.Metrics.micro
                topPadding: Ui.Metrics.micro; bottomPadding: Ui.Metrics.micro
                accessibleName: modelData === null ? "No color" : "Color " + modelData
                enabled: root.writable
                contentItem: Rectangle {
                    color: root.rgba(swatch.modelData)
                    border.width: Ui.Metrics.border
                    border.color: Ui.Theme.borderControl
                    radius: Ui.Metrics.radiusControl
                    Ui.Icon { anchors.centerIn: parent; visible: swatch.modelData === null; name: "close"; size: Ui.Metrics.iconSm }
                }
                onClicked: root.choose(modelData)
            }
        }
    }
    Ui.EditorButton {
        variant: Ui.EditorButton.Outlined
        objectName: "color-custom-" + root.descriptor.name
        text: "Custom color…"
        enabled: root.writable
        onClicked: { root.dialogGeneration = root.generation; custom.selectedColor = root.rgba(root.selected || "#ffffff"); custom.open() }
    }
    Ui.Text { visible: root.selected === null; text: "No color selected"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
    ColorDialog {
        id: custom
        objectName: "color-dialog-" + root.descriptor.name
        parentWindow: root.Window.window
        title: "Choose color"
        options: ColorDialog.ShowAlphaChannel
        onAccepted: if (root.writable && root.dialogGeneration === root.generation) root.choose(root.customColor(selectedColor))
    }
}

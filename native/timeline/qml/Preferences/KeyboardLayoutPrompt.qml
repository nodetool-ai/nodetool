// The first launch's keyboard choice. It floats over the editor, takes no focus
// and blocks nothing: the document is open behind it and keys keep working.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    signal chosen(string layout)
    implicitHeight: content.implicitHeight + 2 * Ui.Metrics.lg
    height: implicitHeight
    radius: Ui.Metrics.radiusCard
    color: Ui.Theme.surfacePanel
    border.width: Ui.Metrics.border
    border.color: Ui.Theme.borderSubtle
    Accessible.role: Accessible.Pane
    Accessible.name: title.text
    Column {
        id: content
        x: Ui.Metrics.lg
        y: Ui.Metrics.lg
        width: parent.width - 2 * Ui.Metrics.lg
        spacing: Ui.Metrics.sm
        Ui.Text {
            id: title
            width: parent.width - close.width
            text: "Choose your keyboard layout"
            role: Ui.Typography.SansTitle
            wrapMode: Text.WordWrap
        }
        Ui.Text {
            width: parent.width
            text: "Use the shortcuts you already know. You can change this in Settings at any time."
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
            wrapMode: Text.WordWrap
        }
        Flow {
            width: parent.width
            spacing: Ui.Metrics.xs
            Repeater {
                model: [{label: "Premiere Pro", value: "premiere"}, {label: "Final Cut Pro", value: "fcp"}]
                delegate: Ui.EditorButton {
                    required property var modelData
                    objectName: "keyboardLayout_" + modelData.value
                    text: modelData.label
                    onClicked: root.chosen(modelData.value)
                }
            }
        }
    }
    Ui.ToolbarIconButton {
        id: close
        objectName: "keyboardLayoutKeep"
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.margins: Ui.Metrics.sm
        iconName: "close"
        accessibleName: "Keep the Premiere Pro layout"
        onClicked: root.chosen("premiere")
    }
}

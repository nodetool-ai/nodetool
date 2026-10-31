import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Item {
    id: root
    property string eyebrow: ""
    property var actions: []
    signal actionTriggered(string label)
    implicitHeight: Ui.Metrics.standard
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.xs
        anchors.rightMargin: Ui.Metrics.xs
        spacing: Ui.Metrics.md
        Ui.Text {
            Layout.fillWidth: true
            text: root.eyebrow.toUpperCase()
            tone: Ui.Text.Secondary
            role: Ui.Typography.SansCaption
            elide: Text.ElideRight
        }
        Row {
            spacing: Ui.Metrics.micro
            Repeater {
                model: root.actions
                Ui.ToolbarIconButton {
                    required property var modelData
                    iconName: modelData.icon || ""
                    enabled: !modelData.disabled
                    accessibleName: modelData.label
                    description: modelData.label
                    iconTone: modelData.variant === "danger" ? Ui.Text.Error : Ui.Text.Secondary
                    onClicked: {
                        root.actionTriggered(modelData.label)
                        if (modelData.onClick) modelData.onClick()
                    }
                }
            }
        }
    }
}

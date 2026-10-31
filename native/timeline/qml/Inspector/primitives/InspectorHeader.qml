import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import NodeTool.Timeline
Item {
    id: root
    property string eyebrow: ""
    property var actions: []
    signal actionTriggered(string label)
    implicitHeight: InspectorTokens.controlMd
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Theme.spacingXs
        anchors.rightMargin: Theme.spacingXs
        spacing: Theme.spacingMd
        Text {
            Layout.fillWidth: true
            text: root.eyebrow.toUpperCase()
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
            font.weight: Font.Medium
            font.letterSpacing: Theme.fontSizeSmaller * 0.06
            elide: Text.ElideRight
        }
        Row {
            spacing: Theme.spacingMicro
            Repeater {
                model: root.actions
                PanelButton {
                    required property var modelData
                    width: Theme.controlXs
                    height: Theme.controlXs
                    text: modelData.label
                    iconPath: modelData.icon || ""
                    iconOnly: true
                    destructive: modelData.variant === "danger"
                    enabled: !modelData.disabled
                    onClicked: {
                        root.actionTriggered(modelData.label)
                        if (modelData.onClick) modelData.onClick()
                    }
                }
            }
        }
    }
}

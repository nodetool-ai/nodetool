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
            font.letterSpacing: font.pixelSize * 0.06
            elide: Text.ElideRight
        }
        Row {
            spacing: Theme.spacingMicro
            Repeater {
                model: root.actions
                Controls.ToolButton {
                    required property var modelData
                    width: Theme.controlXs
                    height: Theme.controlXs
                    text: modelData.icon || ""
                    enabled: !modelData.disabled
                    Accessible.name: modelData.label
                    Controls.ToolTip.text: modelData.label
                    Controls.ToolTip.visible: hovered
                    background: Rectangle { color: parent.hovered ? Theme.actionHover : "transparent"; radius: Theme.radiusSm }
                    contentItem: Text {
                        text: parent.text
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        color: modelData.variant === "danger" ? Theme.error : Theme.textSecondary
                        font.pixelSize: Theme.iconXs
                    }
                    onClicked: {
                        root.actionTriggered(modelData.label)
                        if (modelData.onClick) modelData.onClick()
                    }
                }
            }
        }
    }
}

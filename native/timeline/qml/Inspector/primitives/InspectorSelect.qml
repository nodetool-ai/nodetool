import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
ComboBox {
    id: root
    property string label: ""
    property string value: ""
    property var options: []
    property bool disabled: false
    property bool grow: false
    signal change(string value)
    model: options
    textRole: "label"
    valueRole: "value"
    currentIndex: indexOfValue(value)
    enabled: !disabled
    implicitHeight: InspectorTokens.controlSm
    Accessible.name: label
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    onActivated: change(currentValue)
    opacity: disabled ? 0.5 : 1
    contentItem: Text {
        text: root.displayText
        color: Theme.textPrimary
        font: root.font
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
        leftPadding: Theme.spacingMd
        rightPadding: Theme.spacingXl
    }
    indicator: Text {
        x: root.width - width - Theme.spacingXs
        anchors.verticalCenter: parent.verticalCenter
        text: "⌄"
        color: Theme.textSecondary
        font.pixelSize: Theme.fontSizeSmall
    }
    background: Rectangle { color: Theme.backgroundDefault; border.color: root.activeFocus ? Theme.primary : Theme.overlay; radius: Theme.radiusSm }
}

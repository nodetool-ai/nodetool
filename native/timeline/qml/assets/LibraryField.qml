import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

TextField {
    id: field
    color: Theme.textPrimary
    placeholderTextColor: Theme.textSecondary
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    selectByMouse: true
    implicitHeight: Theme.toolbarHeight
    Accessible.name: placeholderText
    background: Rectangle {
        color: Theme.backgroundDefault
        border.color: field.activeFocus ? Theme.primary : Theme.divider
        radius: Theme.radiusSm
    }
}

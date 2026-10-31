import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.Timeline

Basic.TextField {
    id: control
    implicitHeight: Theme.controlSm
    padding: Theme.spacingXs
    leftPadding: Theme.spacingMd
    rightPadding: Theme.spacingMd
    color: enabled ? Theme.textPrimary : Theme.textDisabled
    placeholderTextColor: Theme.textSecondary
    selectionColor: Theme.primary
    selectedTextColor: Theme.textPrimary
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    selectByMouse: true
    Accessible.name: placeholderText
    background: Rectangle {
        color: Theme.overlay
        radius: Theme.radiusMd
        border.color: control.activeFocus ? Theme.primary : Theme.divider
    }
}

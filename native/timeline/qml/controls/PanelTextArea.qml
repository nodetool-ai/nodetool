import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.Timeline

Basic.TextArea {
    id: control
    padding: Theme.spacingMd
    color: enabled ? Theme.textPrimary : Theme.textDisabled
    placeholderTextColor: Theme.textSecondary
    selectionColor: Theme.primary
    selectedTextColor: Theme.textPrimary
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmall
    wrapMode: TextEdit.Wrap
    selectByMouse: true
    Accessible.name: placeholderText
    background: Rectangle {
        color: control.readOnly ? "transparent" : Theme.overlay
        radius: Theme.radiusMd
        border.color: control.readOnly ? "transparent" : control.activeFocus ? Theme.primary : Theme.divider
    }
}

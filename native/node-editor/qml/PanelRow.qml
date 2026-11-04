import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

// A flat activatable row whose children position themselves against its size.
Basic.AbstractButton {
    id: root
    property bool active: false
    property string accessibleName: text
    Accessible.role: Accessible.Button
    Accessible.name: accessibleName
    Accessible.onPressAction: if (enabled) click()
    focusPolicy: Qt.TabFocus
    font: Ui.Typography.font(Ui.Typography.SansLabel)
    leftPadding: 0; rightPadding: 0; topPadding: 0; bottomPadding: 0
    contentItem: Item {}
    background: Rectangle {
        color: root.down ? Ui.Theme.actionPressed : root.active ? Ui.Theme.actionSelected : root.hovered && root.enabled ? Ui.Theme.actionHover : "transparent"
        radius: Ui.Metrics.radiusControl
        border.width: root.visualFocus ? Ui.Metrics.focus : 0
        border.color: root.visualFocus ? Ui.Theme.borderFocus : Ui.Theme.textPrimary
    }
    Keys.onReturnPressed: if (enabled) click()
    Keys.onEnterPressed: if (enabled) click()
}

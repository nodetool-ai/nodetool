import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Basic.Switch {
    id: root
    property string accessibleName: text
    signal checkedChangedByUser(bool checked)
    Accessible.name: accessibleName
    implicitHeight: Math.max(Metrics.standard, indicator.implicitHeight,
                             implicitContentHeight + topPadding + bottomPadding)
    onToggled: checkedChangedByUser(checked)
    indicator: Rectangle {
        implicitWidth: Metrics.xxxl; implicitHeight: Metrics.iconMd
        radius: height / 2
        color: !root.enabled ? Theme.actionDisabled : root.checked ? Theme.accentPrimary : Theme.borderControl
        border.width: root.visualFocus ? Metrics.focus : Metrics.border
        border.color: root.visualFocus ? Theme.borderFocus : Theme.borderControl
        Rectangle { x: root.checked ? parent.width - width - Metrics.micro : Metrics.micro; anchors.verticalCenter: parent.verticalCenter; width: Metrics.iconXs; height: width; radius: width / 2; color: root.enabled ? Theme.textPrimary : Theme.textDisabled }
    }
    contentItem: Ui.Text { text: root.text; role: Typography.SansLabel; tone: root.enabled ? Ui.Text.Primary : Ui.Text.Disabled; leftPadding: root.indicator.width + Metrics.sm; verticalAlignment: Text.AlignVCenter }
}

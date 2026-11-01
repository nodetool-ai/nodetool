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
    // With no text the control is the switch alone: no side padding.
    leftPadding: text === "" ? 0 : Metrics.xs
    rightPadding: text === "" ? 0 : Metrics.xs
    implicitWidth: Math.max(indicator.implicitWidth, implicitContentWidth) + leftPadding + rightPadding
    indicator: Rectangle {
        x: root.leftPadding
        y: root.topPadding + (root.availableHeight - height) / 2
        implicitWidth: Metrics.xxxl; implicitHeight: Metrics.iconMd
        radius: height / 2
        color: !root.enabled ? Theme.actionDisabled : root.checked ? Theme.accentPrimary : Theme.borderControl
        border.width: root.visualFocus ? Metrics.focus : Metrics.border
        border.color: root.visualFocus ? Theme.borderFocus : Theme.borderControl
        Rectangle { x: root.checked ? parent.width - width - Metrics.micro : Metrics.micro; anchors.verticalCenter: parent.verticalCenter; width: Metrics.iconXs; height: width; radius: width / 2; color: root.enabled ? Theme.textPrimary : Theme.textDisabled }
    }
    contentItem: Ui.Text { visible: root.text !== ""; text: root.text; role: Typography.SansLabel; tone: root.enabled ? Ui.Text.Primary : Ui.Text.Disabled; leftPadding: root.text !== "" ? root.indicator.width + Metrics.sm : 0; verticalAlignment: Text.AlignVCenter }
}

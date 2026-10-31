import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Basic.CheckBox {
    id: root
    property string accessibleName: text
    property int density: Ui.EditorButton.Compact
    signal checkedChangedByUser(bool checked)
    Accessible.name: accessibleName
    implicitHeight: Math.max(density === Ui.EditorButton.Compact ? Metrics.compact : Metrics.standard,
                             indicator.implicitHeight, implicitContentHeight + topPadding + bottomPadding)
    onToggled: checkedChangedByUser(checked)
    indicator: Rectangle {
        implicitWidth: Metrics.iconSm; implicitHeight: Metrics.iconSm
        radius: Metrics.micro
        color: !root.enabled ? Theme.actionDisabled : root.checked ? Theme.accentPrimary : Theme.surfaceInput
        border.width: root.visualFocus ? Metrics.focus : Metrics.border
        border.color: root.visualFocus ? Theme.borderFocus : Theme.borderControl
        Ui.Icon { anchors.centerIn: parent; visible: root.checked; name: "check"; size: Metrics.iconXs; tone: root.enabled ? Ui.Text.OnAccent : Ui.Text.Disabled }
    }
    contentItem: Ui.Text { text: root.text; role: Typography.SansLabel; tone: root.enabled ? Ui.Text.Primary : Ui.Text.Disabled; leftPadding: root.indicator.width + Metrics.sm; verticalAlignment: Text.AlignVCenter }
}

import QtQuick
import QtQuick.Controls.Basic as Basic
Basic.ScrollBar {
    id: root
    implicitWidth: Metrics.sm
    implicitHeight: Metrics.sm
    minimumSize: 0.05
    visible: policy !== Basic.ScrollBar.AlwaysOff
    opacity: policy === Basic.ScrollBar.AlwaysOn || size < 1 ? 1 : 0
    interactive: policy === Basic.ScrollBar.AlwaysOn || size < 1
    background: Rectangle { color: root.hovered || root.pressed ? Theme.actionHover : "transparent"; radius: width / 2 }
    contentItem: Rectangle { radius: Math.min(width, height) / 2; color: !root.enabled ? Theme.actionDisabled : root.pressed ? Theme.borderStrong : root.hovered ? Theme.borderControl : Theme.borderSubtle }
}

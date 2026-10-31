import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Basic.MenuItem {
    id: root
    property string iconName: ""
    property int iconTone: Ui.Text.Primary
    property int textTone: Ui.Text.Primary
    property string accessibleName: text
    property string shortcutText: ""
    Accessible.name: accessibleName
    // Checkable items keep a check column so labels stay aligned whether checked or not.
    readonly property real checkWidth: checkable ? Metrics.iconSm + Metrics.sm : 0
    indicator: null
    implicitWidth: checkWidth + label.implicitWidth + (itemIcon.visible ? itemIcon.width + Metrics.sm : 0) + (shortcut.visible ? shortcut.implicitWidth + Metrics.lg : 0) + leftPadding + rightPadding
    implicitHeight: Math.max(Metrics.compact, label.implicitHeight + Metrics.md)
    leftPadding: Metrics.md
    rightPadding: Metrics.md
    contentItem: Item {
        Row {
            anchors.fill: parent
            spacing: Metrics.sm
            layoutDirection: root.mirrored ? Qt.RightToLeft : Qt.LeftToRight
            Item {
                width: root.checkable ? Metrics.iconSm : 0
                height: parent.height
                visible: root.checkable
                Ui.Icon { objectName: "menuItemCheck"; anchors.centerIn: parent; size: Metrics.iconSm; name: "check"; visible: root.checked; tone: root.enabled ? Ui.Text.Primary : Ui.Text.Disabled }
            }
            Ui.Icon { id: itemIcon; anchors.verticalCenter: parent.verticalCenter; name: root.iconName; visible: name !== ""; tone: root.enabled ? root.iconTone : Ui.Text.Disabled }
            Ui.Text { id: label; objectName: "menuItemLabel"; width: Math.max(0, parent.width - root.checkWidth - (itemIcon.visible ? itemIcon.width + parent.spacing : 0) - (shortcut.visible ? shortcut.implicitWidth + parent.spacing : 0)); anchors.verticalCenter: parent.verticalCenter; text: root.text; role: Typography.SansLabel; tone: root.enabled ? root.textTone : Ui.Text.Disabled; elide: Text.ElideRight }
            Ui.Text { id: shortcut; objectName: "menuItemShortcut"; anchors.verticalCenter: parent.verticalCenter; text: root.shortcutText; visible: text !== ""; role: Typography.MonoCaption; tone: root.enabled ? Ui.Text.Secondary : Ui.Text.Disabled }
        }
    }
    background: Rectangle { color: root.highlighted ? Theme.actionSelected : root.hovered ? Theme.actionHover : "transparent"; radius: Metrics.radiusControl; border.width: root.visualFocus ? Metrics.focus : 0; border.color: Theme.borderFocus }
}

import QtQuick
import QtQuick.Controls.Basic as Basic

Basic.Button {
    id: root
    property bool active: false
    property string accessibleName: text
    default property alias rowContent: content.data
    Accessible.name: accessibleName
    implicitHeight: Math.max(Metrics.standard, content.implicitHeight + Metrics.md)
    leftPadding: Metrics.md; rightPadding: Metrics.md
    contentItem: Item { id: content; implicitWidth: childrenRect.width; implicitHeight: childrenRect.height }
    background: Rectangle { color: root.down ? Theme.actionPressed : root.active ? Theme.actionSelected : root.hovered ? Theme.actionHover : "transparent"; radius: Metrics.radiusControl; border.width: root.visualFocus ? Metrics.focus : 0; border.color: Theme.borderFocus }
}

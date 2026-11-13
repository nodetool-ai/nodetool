import QtQuick
import QtQuick.Controls.Basic as Basic

Basic.Button {
    id: root
    property bool active: false
    property string accessibleName: text
    default property alias rowContent: content.data
    Accessible.name: accessibleName
    // `flat` removes the padding and the minimum height. The row then only supplies activation and
    // the hover, selected, pressed, and focus background, and its children position against its size.
    implicitHeight: flat ? content.implicitHeight : Math.max(Metrics.standard, content.implicitHeight + Metrics.md)
    leftPadding: flat ? 0 : Metrics.md; rightPadding: flat ? 0 : Metrics.md
    topPadding: 0; bottomPadding: 0
    Component.onCompleted: if (flat) focusPolicy = Qt.TabFocus
    Keys.onReturnPressed: if (flat && enabled) click()
    Keys.onEnterPressed: if (flat && enabled) click()
    contentItem: Item { id: content; implicitWidth: childrenRect.width; implicitHeight: childrenRect.height }
    background: Rectangle { color: root.down ? Theme.actionPressed : root.active ? Theme.actionSelected : root.hovered && (!root.flat || root.enabled) ? Theme.actionHover : "transparent"; radius: Metrics.radiusControl; border.width: root.visualFocus ? Metrics.focus : 0; border.color: Theme.borderFocus }
}

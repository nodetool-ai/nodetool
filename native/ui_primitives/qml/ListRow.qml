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
    implicitHeight: flat ? 0 : Math.max(Metrics.standard, content.implicitHeight + Metrics.md)
    leftPadding: flat ? 0 : Metrics.md; rightPadding: flat ? 0 : Metrics.md
    topPadding: 0; bottomPadding: 0
    // A pointer handler declared in the row lands in the content item, where a press no
    // longer reaches the button. Move each one onto the row itself.
    Component.onCompleted: {
        if (flat) focusPolicy = Qt.TabFocus
        for (const child of content.data) {
            if (child && child.grabPermissions !== undefined && child.parent === content) child.parent = root
        }
    }
    Keys.onReturnPressed: if (flat && enabled) click()
    Keys.onEnterPressed: if (flat && enabled) click()
    // A flat row's children anchor to it, so its content reports no implicit size of its own.
    contentItem: Item { id: content; implicitWidth: root.flat ? 0 : childrenRect.width; implicitHeight: root.flat ? 0 : childrenRect.height }
    background: Rectangle { color: root.down ? Theme.actionPressed : root.active ? Theme.actionSelected : root.hovered && (!root.flat || root.enabled) ? Theme.actionHover : "transparent"; radius: Metrics.radiusControl; border.width: root.visualFocus ? Metrics.focus : 0; border.color: Theme.borderFocus }
}

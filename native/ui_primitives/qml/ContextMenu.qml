import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Basic.Menu {
    id: root
    property Item returnFocusTo: null
    parent: Basic.Overlay.overlay
    padding: Metrics.xs
    implicitWidth: {
        let widest = 0
        for (let index = 0; index < count; ++index) {
            const item = itemAt(index)
            if (item) widest = Math.max(widest, item.implicitWidth)
        }
        const desired = widest + leftPadding + rightPadding
        return parent ? Math.min(desired, parent.width) : desired
    }
    function openAt(item) {
        returnFocusTo = item
        const point = item.mapToItem(parent, 0, item.height)
        x = Math.max(0, Math.min(point.x, parent.width - width))
        y = Math.max(0, Math.min(point.y + height <= parent.height ? point.y : point.y - item.height - height, parent.height - height))
        open()
    }
    delegate: Ui.MenuItem {}
    background: Rectangle { color: Theme.surfaceOverlay; radius: Metrics.radiusOverlay; border.width: Metrics.border; border.color: Theme.borderControl }
    onClosed: if (returnFocusTo && returnFocusTo.visible && returnFocusTo.enabled) returnFocusTo.forceActiveFocus(Qt.PopupFocusReason)
}

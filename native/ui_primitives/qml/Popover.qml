import QtQuick
import QtQuick.Controls.Basic as Basic

Basic.Popup {
    id: root
    property Item returnFocusTo: null
    property Item anchor: null
    parent: Basic.Overlay.overlay
    focus: true
    padding: Metrics.md
    closePolicy: Basic.Popup.CloseOnEscape | Basic.Popup.CloseOnPressOutside
    background: Rectangle { color: Theme.surfaceOverlay; radius: Metrics.radiusOverlay; border.width: Metrics.border; border.color: Theme.borderControl }
    function positionAt(item) {
        if (!item || !parent) return
        const point = item.mapToItem(parent, 0, 0)
        const below = point.y + item.height
        const above = point.y - height
        x = Math.max(0, Math.min(point.x, parent.width - width))
        y = Math.max(0, Math.min(below + height <= parent.height ? below : above, parent.height - height))
    }
    function openAt(item) { anchor = item; returnFocusTo = item; positionAt(item); open() }
    onWidthChanged: if (visible && anchor) positionAt(anchor)
    onHeightChanged: if (visible && anchor) positionAt(anchor)
    onClosed: if (returnFocusTo && returnFocusTo.visible && returnFocusTo.enabled) returnFocusTo.forceActiveFocus(Qt.PopupFocusReason)
}

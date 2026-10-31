import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui

Basic.ToolTip {
    id: root
    property Item trigger: null
    parent: Basic.Overlay.overlay
    delay: Metrics.tooltipDelay
    padding: Metrics.sm
    margins: 0
    width: parent ? Math.min(implicitWidth, parent.width) : implicitWidth
    height: parent ? Math.min(implicitHeight, parent.height) : implicitHeight
    readonly property point anchorPoint: trigger && parent ? trigger.mapToItem(parent, 0, trigger.height) : Qt.point(0, 0)
    x: Math.max(0, Math.min(parent ? parent.width - width : 0, anchorPoint.x))
    y: parent && anchorPoint.y + height <= parent.height ? anchorPoint.y : Math.max(0, anchorPoint.y - (trigger ? trigger.height : 0) - height)
    contentItem: Ui.Text { text: root.text; role: Typography.SansCaption; wrapMode: Text.Wrap; clip: true }
    background: Rectangle { color: Theme.surfaceOverlay; radius: Metrics.radiusOverlay; border.width: Metrics.border; border.color: Theme.borderControl }
}

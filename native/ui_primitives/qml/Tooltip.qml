import QtQuick
import QtQuick.Controls.Basic
import NodeTool.UiPrimitives as Ui

ToolTip {
    id: root
    property Item trigger: null
    parent: trigger ? trigger.Overlay.overlay : Overlay.overlay
    delay: Metrics.tooltipDelay
    padding: Metrics.sm
    margins: 0
    width: parent ? Math.min(implicitWidth, parent.width) : implicitWidth
    height: parent ? Math.min(implicitHeight, parent.height) : implicitHeight
    readonly property point anchorPoint: tracker.anchor
    readonly property rect triggerBounds: tracker.bounds
    x: Math.max(0, Math.min(parent ? parent.width - width : 0, anchorPoint.x))
    y: parent && anchorPoint.y + height <= parent.height ? anchorPoint.y : Math.max(0, anchorPoint.y - (trigger ? trigger.height : 0) - height)
    onAboutToShow: tracker.prepare()
    Ui.TooltipTracker {
        id: tracker
        trigger: root.trigger
        overlay: root.parent
        active: root.visible
        onDismissed: root.close()
    }
    contentItem: Ui.Text { text: root.text; role: Typography.SansCaption; wrapMode: Text.Wrap; clip: true }
    background: Rectangle { color: Theme.surfaceOverlay; radius: Metrics.radiusOverlay; border.width: Metrics.border; border.color: Theme.borderControl }
}

import QtQuick
import QtQuick.Controls.Basic as Basic
import NodeTool.UiPrimitives as Ui
Basic.Dialog {
    id: root
    property Item returnFocusTo: null
    parent: Basic.Overlay.overlay
    modal: true
    closePolicy: Basic.Popup.CloseOnEscape
    x: parent ? Math.max(0, (parent.width - width) / 2) : 0
    y: parent ? Math.max(0, (parent.height - height) / 2) : 0
    readonly property bool compactLayout: parent && parent.height < Metrics.touch * 5
    padding: compactLayout ? Metrics.xs : Metrics.xl
    spacing: Metrics.lg
    header: Ui.Text {
        text: root.title
        Accessible.role: Accessible.Heading
        Accessible.name: text
        visible: text !== ""
        role: Typography.SansTitle
        leftPadding: root.padding; rightPadding: root.padding
        topPadding: root.padding + halfLeading; bottomPadding: (root.compactLayout ? Metrics.xs : Metrics.sm) - halfLeading
        elide: Text.ElideRight
    }
    background: Rectangle { color: Theme.surfaceOverlay; radius: Metrics.radiusOverlay; border.width: Metrics.border; border.color: Theme.borderControl }
    Basic.Overlay.modal: Rectangle { color: Theme.scrimModal }
    onClosed: if (returnFocusTo && returnFocusTo.enabled && returnFocusTo.visible) returnFocusTo.forceActiveFocus(Qt.PopupFocusReason)
}

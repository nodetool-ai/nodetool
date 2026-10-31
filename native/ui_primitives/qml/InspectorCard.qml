import QtQuick
import NodeTool.UiPrimitives as Ui
Ui.Surface {
    id: root
    default property alias body: content.data
    implicitHeight: content.implicitHeight + 2 * Metrics.md
    implicitWidth: content.implicitWidth + 2 * Metrics.md
    data: [Column { id: content; x: Metrics.md; y: Metrics.md; width: Math.max(0, root.width - 2 * Metrics.md); spacing: Metrics.sm }]
}

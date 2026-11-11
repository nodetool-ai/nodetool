import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Item {
    implicitHeight: Ui.Metrics.md * 2 + 1
    Rectangle { y: Ui.Metrics.md; width: parent.width; height: 1; color: Ui.Theme.borderSubtle }
}

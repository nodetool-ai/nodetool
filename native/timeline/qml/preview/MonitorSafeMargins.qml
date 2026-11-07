// Action-safe (90%) and title-safe (80%) boxes and the centre cross, as
// fractions of the picture, so they hold for any delivery shape.
import QtQuick
import NodeTool.UiPrimitives as Ui

Item {
    id: margins
    objectName: "monitorSafeMargins"
    Repeater {
        model: [0.05, 0.1]
        delegate: Rectangle {
            required property real modelData
            x: margins.width * modelData
            y: margins.height * modelData
            width: margins.width * (1 - 2 * modelData)
            height: margins.height * (1 - 2 * modelData)
            color: "transparent"
            border.width: Ui.Metrics.border
            border.color: Ui.Theme.borderStrong
        }
    }
    Rectangle {
        x: (margins.width - width) / 2
        y: (margins.height - height) / 2
        width: Ui.Metrics.xl
        height: Ui.Metrics.border
        color: Ui.Theme.borderStrong
    }
    Rectangle {
        x: (margins.width - width) / 2
        y: (margins.height - height) / 2
        width: Ui.Metrics.border
        height: Ui.Metrics.xl
        color: Ui.Theme.borderStrong
    }
}

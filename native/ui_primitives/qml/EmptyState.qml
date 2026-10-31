import QtQuick
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    property string title: ""
    property string message: ""
    property string actionText: ""
    signal actionTriggered()
    spacing: Metrics.md
    Ui.Text { text: root.title; role: Typography.SansTitle; visible: text !== "" }
    Ui.Text { text: root.message; role: Typography.SansBody; visible: text !== "" }
    Ui.EditorButton { text: root.actionText; visible: text !== ""; onClicked: root.actionTriggered() }
}

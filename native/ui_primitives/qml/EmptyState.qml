import QtQuick
import NodeTool.UiPrimitives as Ui

Column {
    id: root
    property string title: ""
    property string message: ""
    property string actionText: ""
    // A positive value wraps and centers the text within that width. Zero keeps each line at its natural width.
    property real maxTextWidth: 0
    signal actionTriggered()
    spacing: Metrics.md
    Ui.Text { id: titleText; text: root.title; role: Typography.SansTitle; visible: text !== ""; wrapMode: root.maxTextWidth > 0 ? Text.Wrap : Text.NoWrap; horizontalAlignment: root.maxTextWidth > 0 ? Text.AlignHCenter : Text.AlignLeft }
    Ui.Text { id: messageText; text: root.message; role: Typography.SansBody; visible: text !== ""; wrapMode: root.maxTextWidth > 0 ? Text.Wrap : Text.NoWrap; horizontalAlignment: root.maxTextWidth > 0 ? Text.AlignHCenter : Text.AlignLeft }
    Binding { target: titleText; property: "width"; value: root.maxTextWidth; when: root.maxTextWidth > 0 }
    Binding { target: messageText; property: "width"; value: root.maxTextWidth; when: root.maxTextWidth > 0 }
    Ui.EditorButton { anchors.horizontalCenter: root.maxTextWidth > 0 ? parent.horizontalCenter : undefined; text: root.actionText; visible: text !== ""; onClicked: root.actionTriggered() }
}

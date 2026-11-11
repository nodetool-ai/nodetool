import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.Text {
    required property var value
    text: value && value.id || ""
    role: Ui.Typography.SansBody
    wrapMode: Text.WrapAnywhere
}

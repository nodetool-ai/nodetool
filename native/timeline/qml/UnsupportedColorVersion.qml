import QtQuick
import NodeTool.UiPrimitives as Ui

Rectangle {
    color: Ui.Theme.surfaceCanvas
    Ui.Text {
        objectName: "unsupportedColorVersionReport"
        anchors.centerIn: parent
        width: Math.min(parent.width - Ui.Metrics.xxxl * 2, Ui.Metrics.dialogWidth)
        text: unsupportedColorVersionMessage
        textFormat: Text.PlainText
        wrapMode: Text.WordWrap
        Accessible.role: Accessible.StaticText
        Accessible.name: text
    }
}

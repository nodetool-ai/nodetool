import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.Text {
    property bool warning: false
    wrapMode: Text.WordWrap
    tone: warning ? Ui.Text.Warning : Ui.Text.Secondary
    role: Ui.Typography.SansCaption
}

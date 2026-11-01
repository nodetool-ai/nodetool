import QtQuick
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    enum State { Success, Warning, Error, Info }
    property int status: Ui.Status.Info
    property string message: ""
    // Wraps a long message over several lines instead of eliding it.
    property bool wrap: false
    implicitWidth: glyph.width + Metrics.sm + label.implicitWidth
    implicitHeight: Math.max(glyph.height, label.implicitHeight)
    onStatusChanged: if (status < 0 || status > 3) { console.warn("Invalid status"); status = Ui.Status.Info }
    Accessible.role: Accessible.StaticText
    Accessible.name: message
    Ui.Icon {
        id: glyph
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        name: root.status === Ui.Status.Success ? "check" : root.status === Ui.Status.Warning ? "warning" : root.status === Ui.Status.Error ? "error" : "info"
        tone: root.status === Ui.Status.Success ? Ui.Text.Success : root.status === Ui.Status.Warning ? Ui.Text.Warning : root.status === Ui.Status.Error ? Ui.Text.Error : Ui.Text.Info
    }
    Ui.Text {
        id: label
        anchors.left: glyph.right
        anchors.leftMargin: Metrics.sm
        anchors.verticalCenter: parent.verticalCenter
        width: Math.max(0, parent.width - glyph.width - Metrics.sm)
        text: root.message
        role: Typography.SansBody
        elide: Text.ElideRight
        wrapMode: root.wrap ? Text.Wrap : Text.NoWrap
    }
}

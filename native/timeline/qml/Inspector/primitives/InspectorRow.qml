import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Item {
    id: root
    property string label: ""
    default property alias content: controls.data
    // The room the controls ask for, even when a narrow panel cannot give it.
    property real controlMinWidth: InspectorTokens.rowControlMinWidth
    // Controls that would leave the label no room move to a line of their own.
    readonly property bool stacked: width > 0 && width - 2 * Ui.Metrics.xs - Ui.Metrics.sm - Math.max(controlMinWidth, controls.implicitWidth) < InspectorTokens.rowLabelMinWidth
    implicitHeight: stacked ? Ui.Metrics.compact + controls.implicitHeight : Math.max(Ui.Metrics.compact, controls.implicitHeight)
    GridLayout {
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.xs
        anchors.rightMargin: Ui.Metrics.xs
        columns: root.stacked ? 1 : 2
        rowSpacing: 0
        columnSpacing: Ui.Metrics.sm
        Ui.Text {
            Layout.fillWidth: true
            Layout.minimumHeight: root.stacked ? Ui.Metrics.compact : -1
            text: root.label
            elide: Text.ElideRight
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
        Item {
            Layout.fillWidth: root.stacked
            Layout.minimumWidth: root.stacked ? 0 : root.controlMinWidth
            implicitWidth: Math.max(root.controlMinWidth, controls.implicitWidth)
            implicitHeight: controls.implicitHeight
            Row {
                id: controls
                anchors.right: parent.right
                spacing: Ui.Metrics.xs
            }
        }
    }
}

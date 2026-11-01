import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
Item {
    id: root
    property string label: ""
    default property alias content: controls.data
    // Items before the label, such as a keyframe button.
    property alias leading: leadingRow.data
    implicitHeight: Math.max(Ui.Metrics.compact, controls.implicitHeight)
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.xs
        anchors.rightMargin: Ui.Metrics.xs
        spacing: Ui.Metrics.sm
        Row {
            id: leadingRow
            visible: children.length > 0
            Layout.alignment: Qt.AlignVCenter
            spacing: Ui.Metrics.xs
        }
        Ui.Text {
            Layout.fillWidth: true
            text: root.label
            elide: Text.ElideRight
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
        Item {
            Layout.minimumWidth: InspectorTokens.rowControlMinWidth
            implicitWidth: Math.max(InspectorTokens.rowControlMinWidth, controls.implicitWidth)
            implicitHeight: controls.implicitHeight
            Row {
                id: controls
                anchors.right: parent.right
                spacing: Ui.Metrics.xs
            }
        }
    }
}

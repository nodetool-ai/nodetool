import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
RowLayout {
    id: root
    property string label: ""
    property real labelWidth: 0
    property alias leading: leadingSlot.data
    property alias trailing: trailingSlot.data
    default property alias valueContent: valueSlot.data
    implicitHeight: Math.max(Metrics.compact, labelItem.implicitHeight)
    spacing: Metrics.sm
    data: [
    Row { id: leadingSlot; spacing: Metrics.xs },
    Ui.Text { id: labelItem; text: root.label; role: Typography.SansLabel; tone: Ui.Text.Secondary; elide: Text.ElideRight; Layout.preferredWidth: root.labelWidth > 0 ? root.labelWidth : implicitWidth },
    Row { id: valueSlot; spacing: Metrics.xs; Layout.fillWidth: true },
    Row { id: trailingSlot; spacing: Metrics.xs }
    ]
}

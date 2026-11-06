import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

RowLayout {
    id: root
    property string text: ""
    default property alias actions: trailing.data
    spacing: Metrics.md
    data: [
        Ui.Text { text: root.text; role: Typography.SansLabel; elide: Text.ElideRight; Layout.fillWidth: true },
        Row { id: trailing; spacing: Metrics.xs }
    ]
}

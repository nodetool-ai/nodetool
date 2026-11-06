import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
InspectorRow {
    id: root
    property string value: "#000000"
    property bool disabled: false
    signal commit(string value)
    Row {
        spacing: Ui.Metrics.xs
        Rectangle { width: Ui.Metrics.small; height: width; radius: Ui.Metrics.xs; color: root.value; border.color: Ui.Theme.borderSubtle }
        InspectorPillInput { value: root.value; disabled: root.disabled; ariaLabel: root.label; onCommit: value => root.commit(value) }
    }
}

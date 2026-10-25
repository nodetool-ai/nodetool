import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
InspectorRow {
    id: root
    property string value: "#000000"
    property bool disabled: false
    signal commit(string value)
    Row {
        spacing: Theme.spacingXs
        Rectangle { width: Theme.controlXs; height: width; radius: Theme.radiusSm; color: root.value; border.color: Theme.divider }
        InspectorPillInput { value: root.value; disabled: root.disabled; ariaLabel: root.label; onCommit: value => root.commit(value) }
    }
}

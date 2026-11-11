import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
InspectorRow {
    id: root
    property bool checked: false
    property bool disabled: false
    signal change(bool next)
    Ui.Toggle {
        checked: root.checked
        enabled: !root.disabled
        id: control
        accessibleName: root.label
        onCheckedChangedByUser: next => root.change(next)
    }
}

import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.Select {
    id: root
    property string label: ""
    property bool disabled: false
    property bool grow: false
    signal change(string value)
    value: ""
    options: []
    accessibleName: label
    density: Ui.EditorButton.Compact
    enabled: !disabled
    onValueCommitted: value => change(String(value))
}

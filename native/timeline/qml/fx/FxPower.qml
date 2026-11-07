import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.CheckBox {
    id: root
    property bool on: false
    property string label: ""
    signal toggle()
    checked: on
    accessibleName: label + " power"
    onCheckedChangedByUser: root.toggle()
}

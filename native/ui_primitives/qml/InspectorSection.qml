import QtQuick
import NodeTool.UiPrimitives as Ui
Column {
    id: root
    property string title: ""
    property bool expanded: true
    property alias headerActions: actions.data
    property alias leading: leadingSlot.data
    default property alias body: bodySlot.data
    signal expansionRequested(bool expanded)
    spacing: Metrics.sm
    data: [
    Row {
        width: root.width
        Row { id: leadingSlot; spacing: Metrics.xs }
        Ui.EditorButton { objectName: "sectionToggle"; iconName: root.expanded ? "arrowDropDown" : "navigateNext"; Accessible.expandable: true; Accessible.expanded: root.expanded; text: root.title; accessibleName: root.title; variant: Ui.EditorButton.Flat; density: Ui.EditorButton.Compact; contentAlignment: Qt.AlignLeft; onClicked: root.expansionRequested(!root.expanded) }
        Row { id: actions; spacing: Metrics.xs }
    },
    Column { id: bodySlot; visible: root.expanded; width: root.width; spacing: Metrics.sm }
    ]
}

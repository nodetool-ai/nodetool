import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

InspectorSelect {
    id: root
    objectName: "gridDivisionSelect"
    label: qsTr("Grid division")
    options: TempoGrid.divisionOptions
    implicitWidth: 2 * (Ui.Metrics.xl * 2) + Ui.Metrics.md
    implicitHeight: InspectorTokens.controlSm
    value: "beat"
    currentIndex: count > 0 ? indexOfValue(value) : -1
}

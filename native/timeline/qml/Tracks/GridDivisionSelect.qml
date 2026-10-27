import QtQuick
import NodeTool.Timeline

InspectorSelect {
    id: root
    objectName: "gridDivisionSelect"
    label: qsTr("Grid division")
    options: TempoGrid.divisionOptions
    implicitWidth: 2 * (Theme.spacingXl * 2) + Theme.spacingMd
    implicitHeight: InspectorTokens.controlSm
    value: "beat"
    currentIndex: count > 0 ? indexOfValue(value) : -1
}

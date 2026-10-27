import QtQuick
import NodeTool.Timeline

Row {
    id: tools
    required property TimelineModel timeline
    required property ClipGestureController gestures
    required property TimelineViewState viewState
    spacing: Theme.spacingMicro

    ToolButton {
        objectName: "barsToggle"
        anchors.verticalCenter: parent.verticalCenter
        label: qsTr("Bars")
        description: qsTr("The ruler counts bars and beats, not seconds")
        iconPath: Icons.straighten
        active: tools.viewState.rulerMode === "bars"
        onClicked: tools.viewState.rulerMode = active ? "time" : "bars"
    }
    GridDivisionSelect {
        anchors.verticalCenter: parent.verticalCenter
        value: tools.viewState.gridDivision
        onChange: value => tools.viewState.gridDivision = value
    }
}

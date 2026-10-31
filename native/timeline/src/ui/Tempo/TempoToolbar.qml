import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Row {
    id: tools
    required property TimelineModel timeline
    required property ClipGestureController gestures
    required property TimelineViewState viewState
    property bool compact: false
    spacing: Ui.Metrics.micro

    ToolButton {
        objectName: "barsToggle"
        anchors.verticalCenter: parent.verticalCenter
        label: qsTr("Bars")
        description: qsTr("The ruler counts bars and beats, not seconds")
        iconName: "straighten"
        active: tools.viewState.rulerMode === "bars"
        compact: tools.compact
        onClicked: tools.viewState.rulerMode = active ? "time" : "bars"
    }
    GridDivisionSelect {
        anchors.verticalCenter: parent.verticalCenter
        value: tools.viewState.gridDivision
        onChange: value => tools.viewState.gridDivision = value
    }
}

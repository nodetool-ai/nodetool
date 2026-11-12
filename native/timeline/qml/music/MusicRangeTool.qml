// nt-panel: slot=toolbar id=musicRangeTool order=20 title="Range"
// The Range tool's toolbar button (docs/MUSIC-MODE.md MD11). It shows in a
// music project, and wherever the tool is on, so the active tool is always
// visible. The key comes from the keyboard preset.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Row {
    id: root
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property bool compact: false
    visible: sequence.isMusic || (!!gestures && gestures.activeTool === "range")
    MusicSequenceState { id: sequence; timeline: root.timeline }
    ToolButton {
        objectName: "tool_range"
        anchors.verticalCenter: parent.verticalCenter
        label: qsTr("Range")
        shortcut: root.gestures && root.gestures.keyboardPreset !== "" ? root.gestures.shortcutFor("rangeTool") : ""
        description: qsTr("Drag across bars on a track to choose what to generate. Alt places an edge freely")
        active: !!root.gestures && root.gestures.activeTool === "range"
        compact: root.compact
        iconName: "piano"
        onClicked: if (root.gestures) root.gestures.activeTool = "range"
    }
}

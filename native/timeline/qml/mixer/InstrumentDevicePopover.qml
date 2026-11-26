pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../instruments"

Ui.Popover {
    id: root
    property TimelineModel timeline: null
    property string trackId: ""
    // JSON data from the document, controller, or shared JavaScript API.
    readonly property var track: controller.channel

    width: Math.min(parent ? parent.width : Ui.Metrics.dialogCompactWidth, Ui.Metrics.dialogCompactWidth)
    height: Math.min(implicitHeight, parent ? parent.height * 0.9 : implicitHeight)

    AutomationController {
        id: controller
        timeline: root.timeline
        trackId: root.trackId
        master: false
    }

    Connections {
        target: root.timeline
        function onDocumentReplaced() { root.close() }
    }

    function show(trackId, anchor) {
        root.trackId = trackId
        root.openAt(anchor)
    }

    Column {
        width: parent.width
        spacing: Ui.Metrics.md

        Row {
            width: parent.width
            Ui.Text {
                role: Ui.Typography.SansLabel
                width: parent.width - 24
                elide: Text.ElideRight
                text: (root.track && root.track.name ? root.track.name + " · " : "") + qsTr("Instrument")
            }
            Ui.ToolbarIconButton {
                objectName: "close-instrument-popover"
                iconName: "close"
                accessibleName: qsTr("Close instrument")
                onClicked: root.close()
            }
        }

        InstrumentRack {
            width: parent.width
            timeline: root.timeline
            track: root.track
            trackId: root.trackId
        }
    }
}

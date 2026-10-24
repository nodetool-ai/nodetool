// Mirrors web/src/components/timeline/Tracks/TrackHeader.tsx: type prefix,
// name, and visibility/lock state.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: header
    required property int index
    required property string name
    required property string trackType
    required property bool trackVisible
    required property bool locked

    height: Theme.trackHeight
    color: Theme.panel

    Rectangle {
        width: 3
        height: parent.height
        color: Theme.clipColor(header.trackType)
    }
    Column {
        x: 14
        anchors.verticalCenter: parent.verticalCenter
        spacing: 2
        Text {
            text: (header.trackType === "overlay" ? "O" : "V") + (header.index + 1) + "  " + header.name
            color: Theme.text
            font.pixelSize: 13
            font.weight: Font.Medium
        }
        Text {
            text: header.trackType + (header.trackVisible ? "" : " · hidden") + (header.locked ? " · locked" : "")
            color: Theme.textMuted
            font.pixelSize: 11
        }
    }
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.divider
    }
    Rectangle {
        anchors.right: parent.right
        width: 1
        height: parent.height
        color: Theme.divider
    }
}

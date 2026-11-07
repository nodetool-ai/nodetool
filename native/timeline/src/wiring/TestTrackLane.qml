import QtQuick
Item {
    required property var track
    required property var timeline
    property int clicks: 0
    objectName: "probe-trackLane-" + track.id
    implicitWidth: 80
    implicitHeight: 24
    MouseArea {
        property bool playheadPassthrough: true
        anchors.fill: parent
        onClicked: parent.clicks++
    }
}

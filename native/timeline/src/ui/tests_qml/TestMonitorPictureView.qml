import QtQuick
Item {
    objectName: "testMonitorPictureView"
    property var timeline: null
    property var clock: null
    property var gestures: null
    property var monitor: null
    readonly property bool keepsPicture: true
    readonly property rect pictureArea: Qt.rect(width / 2, 0, width / 2, height)
}

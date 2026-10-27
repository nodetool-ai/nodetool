import QtQuick
Item {
    property var clip: null
    property var timeline: null
    property var gestures: null
    property var viewState: null
    property var clock: null
    property int clicks: 0
    signal activated()
    implicitWidth: 28
    implicitHeight: 28
    Rectangle { width: 28; height: 28; color: "cyan" }
    MouseArea { width: 28; height: 28; onClicked: { parent.clicks++; parent.activated() } }
}

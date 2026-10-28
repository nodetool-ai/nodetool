import QtQuick
import NodeTool.Timeline

Rectangle {
    id: root
    property bool vertical: true
    property bool invert: false
    property real value: 0
    property real minimum: 100
    property real maximum: 1600
    property string label: ""
    signal resizeRequested(real next)
    color: mouse.containsMouse || mouse.pressed || activeFocus ? Theme.primary : Theme.backgroundDefault
    activeFocusOnTab: true
    Accessible.role: Accessible.Grip
    Accessible.name: label
    function resize(next) { resizeRequested(Math.max(minimum, Math.min(maximum, next))) }
    Keys.onPressed: event => {
        const step = Theme.spacingXl * (invert ? -1 : 1)
        if (event.key === Qt.Key_Left || event.key === Qt.Key_Up) resize(value - step)
        else if (event.key === Qt.Key_Right || event.key === Qt.Key_Down) resize(value + step)
        else if (event.key === Qt.Key_Home) resize(invert ? maximum : minimum)
        else if (event.key === Qt.Key_End) resize(invert ? minimum : maximum)
        else return
        event.accepted = true
    }
    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: root.vertical ? Qt.SplitHCursor : Qt.SplitVCursor
        property point start
        property real initialValue
        onPressed: event => {
            start = mapToItem(null, event.x, event.y)
            initialValue = root.value
            root.forceActiveFocus()
        }
        onReleased: event => {
            const point = mapToItem(null, event.x, event.y)
            const delta = root.vertical ? point.x - start.x : point.y - start.y
            root.resize(initialValue + delta * (root.invert ? -1 : 1))
        }
    }
}

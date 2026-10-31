import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    property bool vertical: true
    property bool invert: false
    property real value: 0
    property real minimum: 100
    property real maximum: 1600
    property string label: ""
    property bool resizing: false
    signal resizeStarted()
    signal resizeRequested(real next)
    signal resizeFinished(bool canceled)
    color: mouse.containsMouse || mouse.pressed || activeFocus ? Ui.Theme.accentPrimary : Ui.Theme.surfaceCanvas
    activeFocusOnTab: true
    Accessible.role: Accessible.Grip
    Accessible.name: label
    function resize(next) { resizeRequested(Math.max(minimum, Math.min(maximum, next))) }
    function finish(canceled) {
        if (!resizing) return
        resizing = false
        resizeFinished(canceled)
    }
    Keys.onPressed: event => {
        if (event.key === Qt.Key_Escape && resizing) { finish(true); event.accepted = true; return }
        const step = Ui.Metrics.xl * (invert ? -1 : 1)
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
        preventStealing: true
        cursorShape: root.vertical ? Qt.SplitHCursor : Qt.SplitVCursor
        property point start
        property real initialValue
        function update(event) {
            if (!root.resizing) return
            const point = mapToItem(null, event.x, event.y)
            const delta = root.vertical ? point.x - start.x : point.y - start.y
            root.resize(initialValue + delta * (root.invert ? -1 : 1))
        }
        onPressed: event => {
            start = mapToItem(null, event.x, event.y)
            initialValue = root.value
            root.forceActiveFocus()
            root.resizing = true
            root.resizeStarted()
        }
        onPositionChanged: event => { if (pressed) update(event) }
        onReleased: event => {
            update(event)
            root.finish(false)
        }
        onCanceled: root.finish(true)
    }
}

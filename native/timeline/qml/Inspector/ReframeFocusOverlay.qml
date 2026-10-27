import QtQuick
import NodeTool.Timeline

// The host supplies the preview frame rectangle and the evaluated layer geometry.
Item {
    id: root
    objectName: "reframeFocusOverlay"
    property ReframeController controller: null
    property string clipId: ""
    property real sourceMs: 0
    property real focusX: 0.5
    property real focusY: 0.5
    property real zoom: 1
    readonly property string value: Math.round(focusX * 100) + "%, " + Math.round(focusY * 100) + "%"
    property var crop: ({left: 0, right: 0, top: 0, bottom: 0})
    property var layerTransform: undefined
    property var parentMatrix: undefined
    property var drawMatrix: undefined
    property bool controlled: false
    property real sourceWidth: 0
    property real sourceHeight: 0
    property real sequenceWidth: 0
    property real sequenceHeight: 0
    property real frameWidth: 0
    property real frameHeight: 0
    readonly property var geometry: ({crop: crop, transform: layerTransform, parentMatrix: parentMatrix, drawMatrix: drawMatrix, sourceWidth: sourceWidth, sourceHeight: sourceHeight, sequenceWidth: sequenceWidth, sequenceHeight: sequenceHeight, frameWidth: frameWidth, frameHeight: frameHeight})
    readonly property var displayed: math.evaluate({op: "sourcePointToReframeViewport", x: focusX, y: focusY, geometry: geometry})
    readonly property real handleRadius: Math.max(Theme.spacingMd, 0.025 * Math.min(frameWidth, frameHeight))
    property bool dragging: false
    property real gestureSourceMs: 0
    property string gestureClipId: ""
    property real gestureZoom: 1
    signal change(real x, real y)
    signal dragStarted()
    signal dragEnded()
    width: frameWidth
    height: frameHeight
    visible: frameWidth > 0 && frameHeight > 0 && sourceWidth > 0 && sourceHeight > 0
    activeFocusOnTab: true
    Accessible.role: Accessible.Slider
    Accessible.name: "Reframe focus point"
    Accessible.description: value
    ReframeController { id: math }
    function update(x, y) {
        const nextX = Math.min(1, Math.max(0, x))
        const nextY = Math.min(1, Math.max(0, y))
        if (!controlled) {
            focusX = nextX
            focusY = nextY
        }
        change(nextX, nextY)
        if (controller && clipId !== "") {
            const payload = {clipId: dragging ? gestureClipId : clipId, sourceMs: dragging ? gestureSourceMs : sourceMs, x: nextX, y: nextY, zoom: dragging ? gestureZoom : zoom}
            if (dragging) controller.preview(payload)
            else controller.apply("addClipReframeKeyframe", payload)
        }
    }
    function updatePointer(x, y) {
        const source = math.evaluate({op: "reframeViewportPointToSource", x: x, y: y, geometry: geometry})
        update(source.x, source.y)
    }
    function beginDrag(x, y) {
        forceActiveFocus()
        gestureSourceMs = sourceMs
        gestureClipId = clipId
        gestureZoom = zoom
        dragging = true
        if (controller) controller.beginGesture("addClipReframeKeyframe", {clipId: clipId, sourceMs: sourceMs})
        dragStarted()
        updatePointer(x, y)
    }
    function endDrag() {
        if (!dragging) return
        if (controller) controller.finishGesture()
        dragging = false
        dragEnded()
    }
    function nudge(key, shift) {
        const step = shift ? 0.05 : 0.01
        if (key === Qt.Key_Left) update(focusX - step, focusY)
        else if (key === Qt.Key_Right) update(focusX + step, focusY)
        else if (key === Qt.Key_Up) update(focusX, focusY - step)
        else if (key === Qt.Key_Down) update(focusX, focusY + step)
        else return false
        return true
    }
    Keys.onPressed: event => { if (nudge(event.key, !!(event.modifiers & Qt.ShiftModifier))) event.accepted = true }
    onActiveFocusChanged: if (!activeFocus) endDrag()
    Component.onDestruction: endDrag()
    Canvas {
        id: handle
        anchors.fill: parent
        onPaint: {
            const ctx = getContext("2d")
            ctx.reset()
            ctx.strokeStyle = Theme.primary
            ctx.lineWidth = Theme.spacingMicro
            const cx = root.displayed.x, cy = root.displayed.y, r = root.handleRadius
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
            ctx.beginPath(); ctx.moveTo(cx - r * 1.5, cy); ctx.lineTo(cx + r * 1.5, cy)
            ctx.moveTo(cx, cy - r * 1.5); ctx.lineTo(cx, cy + r * 1.5); ctx.stroke()
        }
        Connections { target: root; function onDisplayedChanged() { handle.requestPaint() } function onHandleRadiusChanged() { handle.requestPaint() } }
    }
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton
        cursorShape: root.dragging ? Qt.ClosedHandCursor : Qt.CrossCursor
        onPressed: mouse => root.beginDrag(mouse.x, mouse.y)
        onPositionChanged: mouse => { if (pressed) root.updatePointer(mouse.x, mouse.y) }
        onReleased: root.endDrag()
        onCanceled: root.endDrag()
    }
}

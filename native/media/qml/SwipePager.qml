import QtQuick
import NodeTool.UiPrimitives as Ui

// Interactive horizontal paging, as in the macOS photo viewers. Two-finger trackpad swipes,
// mouse drags, wheel notches, keys and buttons all move the same page offset.
// Put the current page at x: pager.offset and a neighbour at pager.offset ± pager.pageWidth.
// The pager emits stepped(delta) when a page change completes, and the owner moves its index.
Item {
    id: pager
    property int index: -1
    property int count: 0
    property bool interactive: true
    property real offset: 0
    readonly property bool hasPrevious: index > 0
    readonly property bool hasNext: index >= 0 && index + 1 < count
    readonly property real gap: Ui.Metrics.xl
    readonly property real pageWidth: width + gap
    // True while a neighbour can show, so the owner can load neighbour pages only when needed.
    readonly property bool moving: offset !== 0
    signal stepped(int delta)

    property real raw: 0
    property real velocity: 0
    property double lastTime: 0
    property int axis: 0 // 0 undecided, 1 horizontal, 2 vertical
    property int pendingStep: 0
    property real wheelTravel: 0

    clip: true

    // Slides one page with the same motion as a swipe. Keys and buttons call this.
    function step(delta) {
        const target = Math.max(0, Math.min(count - 1, index + delta))
        if (target === index) { settleTo(0, 0); return }
        if (Ui.Theme.reducedMotion || !width) { stepped(target - index); return }
        settleTo(target < index ? 1 : -1, 0)
    }
    // The rubber band of AppKit: the travel shrinks as it goes past an end.
    function resist(value) {
        if ((value > 0 && hasPrevious) || (value < 0 && hasNext) || !width) return value
        const c = 0.55
        return Math.sign(value) * (1 - 1 / (Math.abs(value) * c / width + 1)) * width
    }
    function begin() {
        settle.stop()
        if (pendingStep) finish()
        raw = offset
        velocity = 0
        lastTime = Date.now()
    }
    function move(delta) {
        const now = Date.now(), dt = Math.max(1, now - lastTime)
        velocity = 0.7 * (delta / dt) + 0.3 * velocity
        lastTime = now
        raw += delta
        offset = resist(raw)
    }
    // Commits on a quick flick or past a third of the page, otherwise springs back.
    function end(releaseVelocity) {
        const v = releaseVelocity === undefined ? velocity : releaseVelocity
        let direction = 0
        if (Math.abs(v) > 0.35 && Math.sign(v) === Math.sign(offset || v)) direction = v > 0 ? 1 : -1
        else if (Math.abs(offset) > width / 3) direction = offset > 0 ? 1 : -1
        if ((direction > 0 && !hasPrevious) || (direction < 0 && !hasNext)) direction = 0
        settleTo(direction, v)
    }
    function settleTo(direction, releaseVelocity) {
        pendingStep = -direction
        const target = direction * pageWidth
        const distance = Math.abs(target - offset)
        if (Ui.Theme.reducedMotion || distance < 0.5) { offset = target; finish(); return }
        // A fast release finishes sooner, so the page keeps the speed of the fingers.
        const speed = Math.abs(releaseVelocity || 0)
        settle.duration = Math.max(Ui.Metrics.motionQuick, Math.min(Ui.Metrics.motionNormal * 2,
            speed > 0.1 ? distance / speed * 1.6 : Ui.Metrics.motionNormal * 1.5))
        settle.to = target
        settle.restart()
    }
    function finish() {
        const delta = pendingStep
        pendingStep = 0
        if (delta) stepped(delta)
        offset = 0
        raw = 0
    }
    function endTrackpad() {
        idle.stop()
        if (tracking && (axis === 1 || offset !== 0)) end()
        tracking = false
        axis = 0
    }
    property bool tracking: false
    function trackpadWheel(event) {
        if (event.phase === Qt.ScrollBegin) { axis = 0; tracking = true; begin(); return }
        // The end event can be lost, so momentum or a pause in the events also ends the swipe.
        if (event.phase === Qt.ScrollMomentum || event.phase === Qt.ScrollEnd) { endTrackpad(); return }
        if (!tracking) { axis = 0; tracking = true; begin() }
        idle.restart()
        // pixelDelta already follows the system scroll direction, so the page moves with the fingers.
        const dx = event.pixelDelta.x, dy = event.pixelDelta.y
        if (axis === 0 && Math.abs(dx) + Math.abs(dy) > 2) axis = Math.abs(dx) >= Math.abs(dy) ? 1 : 2
        if (axis === 1) move(dx)
    }
    // Mouse wheel notches add up until they pass one notch, then step one page.
    function wheelStep(delta) {
        wheelTravel += delta
        if (Math.abs(wheelTravel) < 120) return
        step(wheelTravel > 0 ? -1 : 1)
        wheelTravel = 0
    }

    Timer { id: idle; interval: 250; onTriggered: pager.endTrackpad() }
    NumberAnimation {
        id: settle
        target: pager
        property: "offset"
        easing.type: Easing.OutCubic
        onFinished: pager.finish()
    }
    WheelHandler {
        objectName: pager.objectName + "Wheel"
        enabled: pager.interactive
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onWheel: event => {
            if (event.phase !== Qt.NoScrollPhase || event.pixelDelta.x !== 0 || event.pixelDelta.y !== 0) pager.trackpadWheel(event)
            else pager.wheelStep(Math.abs(event.angleDelta.x) > Math.abs(event.angleDelta.y) ? event.angleDelta.x : event.angleDelta.y)
        }
    }
    DragHandler {
        objectName: pager.objectName + "Swipe"
        enabled: pager.interactive
        target: null
        yAxis.enabled: false
        property real lastX: 0
        onActiveChanged: {
            if (active) { lastX = 0; pager.begin() }
            else pager.end(centroid.velocity.x / 1000)
        }
        onTranslationChanged: if (active) { pager.move(translation.x - lastX); lastX = translation.x }
    }
}

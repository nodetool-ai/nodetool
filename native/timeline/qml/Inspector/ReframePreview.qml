import QtQuick
import NodeTool.Timeline

Item {
    id: root
    required property TimelineModel timeline
    required property PlaybackClock clock
    property var gestures: null
    readonly property var selection: gestures ? gestures.selection : []
    // Use the document read, so the compiled binding keeps it as a dependency.
    readonly property var state: edits.document ? edits.previewState(selection, clock.time) : ({})
    function findGestures(item) {
        if (!item) return null
        if (item.gestures !== undefined) return item.gestures
        for (const child of item.children || []) {
            const found = findGestures(child)
            if (found) return found
        }
        return null
    }
    function attach() {
        let editor = null
        for (let item = parent; item; item = item.parent) {
            if (item.timeline !== undefined && item.clock !== undefined) editor = item
        }
        gestures = findGestures(editor)
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)
    ReframeController { id: edits; model: root.timeline }
    ReframeFocusOverlay {
        anchors.fill: parent
        visible: !!root.state.clipId && root.width > 0 && root.height > 0
        controlled: true
        controller: edits
        clipId: root.state.clipId || ""
        sourceMs: root.state.sourceMs || 0
        focusX: root.state.x === undefined ? 0.5 : root.state.x
        focusY: root.state.y === undefined ? 0.5 : root.state.y
        zoom: root.state.zoom || 1
        crop: root.state.crop || ({left: 0, right: 0, top: 0, bottom: 0})
        drawMatrix: root.state.drawMatrix
        sourceWidth: root.state.sourceWidth || 0
        sourceHeight: root.state.sourceHeight || 0
        sequenceWidth: root.state.sequenceWidth || 0
        sequenceHeight: root.state.sequenceHeight || 0
        frameWidth: root.width
        frameHeight: root.height
    }
}

pragma ComponentBehavior: Bound
// nt-panel: slot=clipBody id=midiNoteLines order=5 title="Note lines"
// The notes of a midi clip as short horizontal lines under the name band. One
// MidiNoteLinesItem draws the whole clip. Its visible window moves in 256 px
// steps with the scroll, so a scroll rebuilds the lines once per step.
import QtQuick
import NodeTool.Timeline

Item {
    id: root
    // JSON data from the document, controller, or shared JavaScript API.
    property var clip: ({})
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    readonly property real step: 256
    readonly property real bodyX: body ? body.contentX : 0
    readonly property real scrollLeft: viewState ? viewState.scrollLeftPx : 0
    readonly property real viewportWidth: viewState ? viewState.viewportWidthPx : width
    readonly property ClipBody body: {
        let item = parent
        while (item) {
            if (item.contentX !== undefined && item.hovered !== undefined && item.selected !== undefined) return item as ClipBody
            item = item.parent
        }
        return null
    }
    anchors.fill: parent

    // The Loader sizes its item, so the band offset sits on the Loader.
    Loader {
        active: root.clip.mediaType === "midi"
        y: TimelineMetrics.clipNameBandHeight
        width: root.width
        height: Math.max(0, root.height - y)
        sourceComponent: MidiNoteLinesItem {
            objectName: "midiNoteLines-" + root.clip.id
            timeline: root.timeline
            clipId: root.clip.id || ""
            msPerPx: root.viewState ? root.viewState.msPerPx : 10
            visibleFromPx: Math.floor((root.scrollLeft - root.bodyX - root.step) / root.step) * root.step
            visibleToPx: Math.ceil((root.scrollLeft + root.viewportWidth - root.bodyX + root.step) / root.step) * root.step
            color: Qt.alpha(TimelineVisuals.clipText, 0.85)
            mutedColor: Qt.alpha(TimelineVisuals.clipText, 0.3)
        }
    }
}

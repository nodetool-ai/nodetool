pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

Item {
    id: host
    // JSON data from the document, controller, or shared JavaScript API.
    required property var track
    required property TimelineModel timeline
    readonly property bool expanded: TrackEffectsState.expandedFxTrackId === track.id
    readonly property Item viewport: ancestor("lanesViewport")
    readonly property Item content: ancestor("lanesContent")
    implicitHeight: expanded ? 280 : 0
    visible: expanded
    function ancestor(name) {
        let p = parent
        while (p) {
            if (p.objectName === name) return p
            p = p.parent
        }
        return null
    }
    TrackEffectsPanel {
        x: host.content ? -host.content.x : 0
        width: host.viewport ? host.viewport.width : host.width
        height: 280
        track: host.track
        timeline: host.timeline
    }
}

import QtQuick
import NodeTool.Timeline

Item {
    id: host
    required property var track
    required property TimelineModel timeline
    readonly property bool expanded: TrackEffectsState.expandedFxTrackId === track.id
    readonly property var viewport: ancestor("lanesViewport")
    readonly property var content: ancestor("lanesContent")
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

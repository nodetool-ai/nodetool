pragma Singleton
import QtQuick
import NodeTool.Timeline
QtObject {
    property var shownAutomationTrackIds: []
    property bool mixerOpen: false
    property TimelineModel timeline: null
    property TimelineViewState viewState: null
    function toggleTrackAutomation(trackId) {
        shownAutomationTrackIds = shownAutomationTrackIds.includes(trackId)
            ? shownAutomationTrackIds.filter(id => id !== trackId) : shownAutomationTrackIds.concat([trackId])
    }
}

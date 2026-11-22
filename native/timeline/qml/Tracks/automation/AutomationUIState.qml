pragma Singleton
import QtQuick
import NodeTool.Timeline
import "automationTargets.js" as Targets
QtObject {
    property AutomationRecorder recorder: null
    property bool showAutomation: false
    property var shownAutomationTrackIds: []
    property var shownParameters: ({})
    property bool mixerOpen: false
    property TimelineModel timeline: null
    property TimelineViewState viewState: null
    function shownKey(track) {
        const specs = Targets.automationTargetSpecs(track)
        const valid = specs.map(s => s.key)
        const stored = shownParameters[track.id]
        if (valid.includes(stored)) { return stored }
        const populated = (track.automation || []).find(l => l.points.length && valid.includes(Targets.key(l.target)))
        return populated ? Targets.key(populated.target) : specs.length ? specs[0].key : ""
    }
    function setShown(trackId, key) {
        const next = Object.assign({}, shownParameters)
        next[trackId] = key
        shownParameters = next
    }
    function subLanes(track) {
        const key = shownKey(track)
        return (track.automation || []).filter(l => Targets.key(l.target) !== key)
    }
    function toggleTrackAutomation(trackId) {
        shownAutomationTrackIds = shownAutomationTrackIds.includes(trackId)
            ? shownAutomationTrackIds.filter(id => id !== trackId) : shownAutomationTrackIds.concat([trackId])
    }
}

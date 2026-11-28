pragma Singleton
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import "automationTargets.js" as Targets
QtObject {
    id: state
    property AutomationRecorder recorder: timeline ? timeline.automationRecorder : null
    signal meterTick()
    property int decayingMeters: 0
    property int meterTicks: 0
    property int playingMeters: 0
    property int activeMeters: 0
    property Timer meterTimer: Timer {
        interval: 33
        repeat: true
        running: state.playingMeters>0 || state.decayingMeters>0
        onTriggered: { ++state.meterTicks; state.meterTick() }
    }
    // The UI probes the existing atomic peaks while transport is stopped.
    // Audio publication stays allocation-free and never calls back into QML.
    property Timer auditionProbe: Timer {
        interval: 50
        repeat: true
        running: state.activeMeters>0 && !state.meterTimer.running
        onTriggered: if (AutomationMeters.hasSignal()) { ++state.meterTicks; state.meterTick() }
    }
    property bool showAutomation: false
    property list<string> shownAutomationTrackIds: []
    // JSON automation target keys indexed by track id.
    property var shownParameters: ({})
    property bool mixerOpen: false
    property TimelineModel timeline: null
    property TimelineModel stateTimeline: null
    property TimelineViewState viewState: null
    function resetDocumentState() { shownAutomationTrackIds=[]; shownParameters=({}) }
    onTimelineChanged: {
        if (timeline && stateTimeline && timeline !== stateTimeline) { resetDocumentState() }
        if (timeline) { stateTimeline=timeline }
    }
    onStateTimelineChanged: if (!stateTimeline) resetDocumentState()
    property Connections documentConnection: Connections {
        target: state.stateTimeline
        function onDocumentReplaced() { state.resetDocumentState() }
    }
    function shownKey(track) {
        const specs = Targets.automationTargetSpecs(track)
        const valid = new Set(specs.map(s => s.key))
        const stored = shownParameters[track.id]
        if (valid.has(stored)) { return stored }
        const populated = (track.automation || []).find(l => l.points.length && valid.has(Targets.key(l.target)))
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

pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.TimelinePlayer
import NodeTool.UiPrimitives as Ui
import "faderTaper.js" as Taper
import "meterLevels.js" as Levels

Item {
    id: root
    property string channelId: ""
    property PlaybackClock clock: null
    property bool active: true
    property bool horizontal: false
    property real decay: horizontal ? 0.85 : 0.95
    property real peakLeft: 0
    property real peakRight: 0
    property real heldLeft: 0
    property real heldRight: 0
    property bool clipLeft: false
    property bool clipRight: false
    property int polls: 0
    readonly property bool decaying: active && visible && (heldLeft>0 || heldRight>0)
    readonly property bool playing: active && visible && clock !== null && clock.playing
    readonly property bool monitoring: active && visible
    property bool countedActive: false
    onMonitoringChanged: {
        if (monitoring!==countedActive) {
            AutomationUIState.activeMeters += monitoring ? 1 : -1
            countedActive=monitoring
        }
    }
    property bool countedPlaying: false
    onPlayingChanged: {
        if (playing!==countedPlaying) {
            AutomationUIState.playingMeters += playing ? 1 : -1
            countedPlaying=playing
        }
    }
    property bool countedDecay: false
    onDecayingChanged: {
        if (decaying!==countedDecay) {
            AutomationUIState.decayingMeters += decaying ? 1 : -1
            countedDecay=decaying
        }
    }
    Component.onCompleted: {
        if (monitoring && !countedActive) { countedActive=true; ++AutomationUIState.activeMeters }
    }
    Component.onDestruction: {
        if (countedActive) { countedActive=false; --AutomationUIState.activeMeters }
        if (countedDecay) { countedDecay=false; --AutomationUIState.decayingMeters }
        if (countedPlaying) { countedPlaying=false; --AutomationUIState.playingMeters }
    }
    onActiveChanged: if (!active) resetLevels()
    onVisibleChanged: if (!visible) resetLevels()
    onChannelIdChanged: resetLevels()
    function resetLevels() {
        peakLeft=0; peakRight=0; heldLeft=0; heldRight=0
        clipLeft=false; clipRight=false
    }
    function updateLevels() {
        ++polls
        const frame=AutomationMeters.take(channelId)
        peakLeft=frame[0]
        peakRight=frame[1]
        const l=Math.max(peakLeft,heldLeft*decay), r=Math.max(peakRight,heldRight*decay)
        heldLeft=l<0.00001 ? 0 : l
        heldRight=r<0.00001 ? 0 : r
        clipLeft=clipLeft || peakLeft>=1
        clipRight=clipRight || peakRight>=1
    }
    Connections {
        target: AutomationUIState
        enabled: root.active && root.visible
        function onMeterTick() { root.updateLevels() }
    }
    Ui.LevelMeter {
        anchors.fill: parent
        scalar: true
        horizontal: root.horizontal
        accessibleName: qsTr("Channel level")
        levelLeft: Taper.dbToFaderPosition(Levels.db(root.horizontal ? root.heldLeft : root.peakLeft))
        levelRight: Taper.dbToFaderPosition(Levels.db(root.horizontal ? root.heldRight : root.peakRight))
        heldLeft: Taper.dbToFaderPosition(Levels.db(root.heldLeft))
        heldRight: Taper.dbToFaderPosition(Levels.db(root.heldRight))
        clippedLeft: root.clipLeft
        clippedRight: root.clipRight
        stateLeft: root.horizontal ? (levelLeft>=1 ? "error" : levelLeft>=.86 ? "warning" : "normal")
            : root.peakLeft>=1 ? "error" : root.peakLeft>=.7 ? "warning" : "normal"
        stateRight: root.horizontal ? (levelRight>=1 ? "error" : levelRight>=.86 ? "warning" : "normal")
            : root.peakRight>=1 ? "error" : root.peakRight>=.7 ? "warning" : "normal"
        onResetRequested: { root.clipLeft=false; root.clipRight=false }
    }
}

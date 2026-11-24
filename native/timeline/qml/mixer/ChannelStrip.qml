import QtQuick
import NodeTool.UiPrimitives as Ui
import NodeTool.Timeline
Ui.Surface {
    id: root
    variant: Ui.Surface.Panel
    property TimelineModel timeline: null
    property string trackId: ""
    property bool master: false
    property bool compact: false
    readonly property var channel: controller.channel
    readonly property string channelId: master ? "master" : trackId
    readonly property string channelName: master ? "Master" : (channel.name || trackId)
    readonly property color accent: master ? Ui.Theme.textPrimary : TimelineVisuals.trackAccent(channel.type)
    property bool volumeConsumed: false
    property bool panConsumed: false
    // The params whose live value this strip holds in the mixer override during a drag.
    property var previewing: ({})
    function preview(param, value) { previewing[param] = true; controller.previewMixer(param, value) }
    function release(param) { if (previewing[param]) { delete previewing[param]; controller.previewMixer(param, NaN) } }
    readonly property AutomationRecorder recorder: master || !timeline ? null
        : AutomationUIState.recorder && AutomationUIState.recorder.timeline === timeline ? AutomationUIState.recorder : timeline.automationRecorder
    function start(param) {
        const used = recorder ? recorder.gestureStart(trackId,param) : false
        if (param === "volumeDb") { volumeConsumed = used }
        else { panConsumed = used }
    }
    function commit(param, value) {
        const used = param === "volumeDb" ? volumeConsumed : panConsumed
        if (used || (recorder && recorder.consumes(trackId))) {
            if (recorder) recorder.record(trackId,param,value)
            return
        }
        controller.edit(param === "pan" ? "setTrackPan" : master ? "setMasterVolume" : "setTrackVolume",
            param === "pan" ? {pan:value} : {db:value})
    }
    Component.onDestruction: {
        release("volumeDb"); release("pan")
        if (recorder) { recorder.gestureEnd(trackId,"volumeDb"); recorder.gestureEnd(trackId,"pan") }
    }
    signal openEffect(string trackId, string effectId, var anchor)
    signal openInstrument(string trackId, var anchor)
    objectName: "mixer-strip-" + channelId
    implicitWidth: 120; implicitHeight: 300
    AutomationController { id: controller; timeline: root.timeline; trackId: root.trackId; master: root.master }
    Rectangle { x: 1; y: 0; width: parent.width-2; height: 3; color: root.accent; radius: Ui.Metrics.micro }
    Connections { target: root.timeline; function onDocumentReplaced() { view.cancelGesture() } }
    AutomationReadout { id: volumeReading; timeline: root.timeline; trackId: root.trackId; target: ({kind:"mixer",param:"volumeDb"}); clock: root.visible && root.recorder ? root.recorder.clock : null }
    AutomationReadout { id: panReading; timeline: root.timeline; trackId: root.trackId; target: ({kind:"mixer",param:"pan"}); clock: root.visible && root.recorder ? root.recorder.clock : null }
    ChannelStripView {
        id: view
        anchors.fill: parent; anchors.margins: Ui.Metrics.xs; anchors.topMargin: Ui.Metrics.md
        liveDb: root.master ? (root.channel.volumeDb || 0) : volumeReading.value
        livePan: panReading.value
        volumeRecording: root.volumeConsumed
        channel: root.channel; channelId: root.channelId; channelName: root.channelName; master: root.master; compact: root.compact
        onVolumeStarted: root.start("volumeDb")
        onVolumePreview: db => { if (root.recorder && (root.volumeConsumed || root.recorder.consumes(root.trackId))) { if (!root.volumeConsumed) { root.start("volumeDb") }; view.draftDb=Math.max(-60,Math.min(6,db)); root.recorder.record(root.trackId,"volumeDb",view.draftDb) } else { root.preview("volumeDb",db) } }
        onVolumeCommit: db => root.commit("volumeDb",db)
        onVolumeEnded: { root.release("volumeDb"); if (root.recorder) { root.recorder.gestureEnd(root.trackId,"volumeDb") }; root.volumeConsumed=false }
        onVolumeCanceled: { root.release("volumeDb"); if (root.recorder) { root.recorder.gestureCancel(root.trackId,"volumeDb") }; root.volumeConsumed=false }
        onPanStarted: root.start("pan")
        onPanPreview: value => { if (root.recorder && (root.panConsumed || root.recorder.consumes(root.trackId))) { if (!root.panConsumed) { root.start("pan") }; root.recorder.record(root.trackId,"pan",value) } else { root.preview("pan",value) } }
        onPanCommit: pan => root.commit("pan",pan)
        onPanEnded: { root.release("pan"); if (root.recorder) { root.recorder.gestureEnd(root.trackId,"pan") }; root.panConsumed=false }
        onPanCanceled: { root.release("pan"); if (root.recorder) { root.recorder.gestureCancel(root.trackId,"pan") }; root.panConsumed=false }
        onMute: controller.edit("setTrackMuted", {muted:!root.channel.muted})
        onSolo: controller.edit("setTrackSolo", {solo:!root.channel.solo})
        onAddEffect: effect => controller.edit(root.master?"addMasterEffect":"addTrackEffect", {effect:effect})
        onToggleEffect: (effectId, enabled) => controller.edit(root.master?"updateMasterEffect":"updateTrackEffect", {effectId:effectId,patch:{enabled:enabled}})
        onOpenEffect: (effectId, anchor) => root.openEffect(root.master?"":root.trackId,effectId,anchor)
        onOpenInstrument: anchor => root.openInstrument(root.trackId, anchor)
    }
}

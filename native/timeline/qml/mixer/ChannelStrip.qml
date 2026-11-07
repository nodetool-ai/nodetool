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
    signal openEffect(string trackId, string effectId, var anchor)
    objectName: "mixer-strip-" + channelId
    implicitWidth: 120; implicitHeight: 300
    AutomationController { id: controller; timeline: root.timeline; trackId: root.trackId; master: root.master }
    Rectangle { x: 1; y: 0; width: parent.width-2; height: 3; color: root.accent; radius: Ui.Metrics.micro }
    Connections { target: root.timeline; function onDocumentReplaced() { view.cancelGesture() } }
    ChannelStripView {
        id: view
        anchors.fill: parent; anchors.margins: Ui.Metrics.xs; anchors.topMargin: Ui.Metrics.md
        channel: root.channel; channelId: root.channelId; channelName: root.channelName; master: root.master; compact: root.compact
        onVolumeCommit: db => controller.edit(root.master ? "setMasterVolume" : "setTrackVolume", {db:db})
        onPanCommit: pan => controller.edit("setTrackPan", {pan:pan})
        onMute: controller.edit("setTrackMuted", {muted:!root.channel.muted})
        onSolo: controller.edit("setTrackSolo", {solo:!root.channel.solo})
        onAddEffect: effect => controller.edit(root.master?"addMasterEffect":"addTrackEffect", {effect:effect})
        onToggleEffect: (effectId, enabled) => controller.edit(root.master?"updateMasterEffect":"updateTrackEffect", {effectId:effectId,patch:{enabled:enabled}})
        onOpenEffect: (effectId, anchor) => root.openEffect(root.master?"":root.trackId,effectId,anchor)
    }
}

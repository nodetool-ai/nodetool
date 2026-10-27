import QtQuick
import NodeTool.Timeline
Rectangle {
    id: root
    property TimelineModel timeline: null
    property string trackId: ""
    property bool master: false
    property bool compact: false
    readonly property var channel: controller.channel
    readonly property string channelId: master ? "master" : trackId
    readonly property string channelName: master ? "Master" : (channel.name || trackId)
    readonly property color accent: master ? Theme.textPrimary : Theme.trackAccent(channel.type)
    signal openEffect(string trackId, string effectId, var anchor)
    objectName: "mixer-strip-" + channelId
    implicitWidth: 120; implicitHeight: 300
    color: master ? Theme.actionHover : Theme.backgroundPaper
    border.width: 1; border.color: Theme.divider; radius: Theme.radiusMd
    AutomationController { id: controller; timeline: root.timeline; trackId: root.trackId; master: root.master }
    Rectangle { x: 1; y: 0; width: parent.width-2; height: 3; color: root.accent; radius: Theme.radiusXs }
    Connections { target: root.timeline; function onDocumentReplaced() { view.cancelGesture() } }
    ChannelStripView {
        id: view
        anchors.fill: parent; anchors.margins: Theme.spacingXs; anchors.topMargin: Theme.spacingXs+3
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

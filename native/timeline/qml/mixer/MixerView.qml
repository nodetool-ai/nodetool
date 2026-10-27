import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
Rectangle {
    id: root
    property TimelineModel timeline: null
    readonly property string channelKey: controller.tracks.filter(t => t.type === "audio" || t.type === "midi").map(t => t.id).join("\u0000")
    readonly property var channelTracks: channelKey ? channelKey.split("\u0000") : []
    readonly property bool compact: width <= 520
    readonly property real masterWidth: compact ? 88 : 120
    readonly property real channelsWidth: compact || !channelTracks.length ? width-masterWidth-16 : Math.min(width-masterWidth-16,channelTracks.length*124+4)
    readonly property real stripWidth: compact ? Math.max(80,(channelsWidth-16)/3) : 120
    implicitHeight: 300; color: Theme.backgroundDefault
    AutomationController { id: controller; timeline: root.timeline }
    Flickable {
        id: channels; x: Theme.spacingXs; y: Theme.spacingXs; width: root.channelsWidth; height: parent.height-2*Theme.spacingXs
        contentWidth: channelRow.width; clip: true; boundsBehavior: Flickable.StopAtBounds
        Row {
            id: channelRow; height: channels.height; spacing: Theme.spacingXs
            Repeater {
                model: root.channelTracks
                delegate: ChannelStrip {
                    required property var modelData
                    width: root.stripWidth; height: channels.height
                    trackId: modelData; timeline: root.timeline; compact: root.compact
                    onOpenEffect: (trackId,effectId,anchor) => effectPopover.show(trackId,effectId,anchor)
                }
            }
        }
        Controls.ScrollBar.horizontal: Controls.ScrollBar {}
    }
    Text {
        visible: root.channelTracks.length===0; x: Theme.spacingMd; width: channels.width-2*Theme.spacingMd
        anchors.verticalCenter: parent.verticalCenter
        text: "No audio or MIDI tracks\nAdd an audio or MIDI track to mix it here."
        horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap
        color: Theme.textSecondary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall
    }
    Rectangle { x: channels.x+channels.width+Theme.spacingXs; height: parent.height; width: 1; color: Theme.divider }
    ChannelStrip {
        x: channels.x+channels.width+2*Theme.spacingXs; y: Theme.spacingXs
        width: root.masterWidth; height: parent.height-2*Theme.spacingXs; master: true; timeline: root.timeline; compact: root.compact
        onOpenEffect: (trackId,effectId,anchor) => effectPopover.show(trackId,effectId,anchor)
    }
    EffectDevicePopover { id: effectPopover; timeline: root.timeline }
}

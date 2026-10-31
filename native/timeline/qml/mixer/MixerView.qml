import QtQuick
import NodeTool.UiPrimitives as Ui
import QtQuick.Controls as Controls
import NodeTool.Timeline
Ui.Surface {
    id: root
    variant: Ui.Surface.Canvas
    property TimelineModel timeline: null
    readonly property string channelKey: controller.tracks.filter(t => t.type === "audio" || t.type === "midi").map(t => t.id).join("\u0000")
    readonly property var channelTracks: channelKey ? channelKey.split("\u0000") : []
    readonly property bool compact: width <= 520
    readonly property real masterWidth: compact ? 88 : 120
    readonly property real channelsWidth: compact || !channelTracks.length ? width-masterWidth-16 : Math.min(width-masterWidth-16,channelTracks.length*124+4)
    readonly property real stripWidth: compact ? Math.max(80,(channelsWidth-16)/3) : 120
    implicitHeight: 300
    AutomationController { id: controller; timeline: root.timeline }
    Flickable {
        id: channels; x: Ui.Metrics.xs; y: Ui.Metrics.xs; width: root.channelsWidth; height: parent.height-2*Ui.Metrics.xs
        contentWidth: channelRow.width; clip: true; boundsBehavior: Flickable.StopAtBounds
        Row {
            id: channelRow; height: channels.height; spacing: Ui.Metrics.xs
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
        Controls.ScrollBar.horizontal: Ui.ScrollBar {}
    }
    Ui.Text { role: Ui.Typography.SansLabel;
        visible: root.channelTracks.length===0; x: Ui.Metrics.md; width: channels.width-2*Ui.Metrics.md
        anchors.verticalCenter: parent.verticalCenter
        text: "No audio or MIDI tracks\nAdd an audio or MIDI track to mix it here."
        horizontalAlignment: Text.AlignHCenter; wrapMode: Text.WordWrap
        tone: Ui.Text.Secondary;
    }
    Ui.Separator { x: channels.x + channels.width + Ui.Metrics.xs; height: parent.height; orientation: Qt.Vertical }
    ChannelStrip {
        x: channels.x+channels.width+2*Ui.Metrics.xs; y: Ui.Metrics.xs
        width: root.masterWidth; height: parent.height-2*Ui.Metrics.xs; master: true; timeline: root.timeline; compact: root.compact
        onOpenEffect: (trackId,effectId,anchor) => effectPopover.show(trackId,effectId,anchor)
    }
    EffectDevicePopover { id: effectPopover; timeline: root.timeline }
}

pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.UiPrimitives as Ui
import QtQuick.Controls as Controls
import NodeTool.Timeline
Ui.Surface {
    id: root
    variant: Ui.Surface.Canvas
    property TimelineModel timeline: null
    readonly property bool compact: width <= 520
    readonly property real masterWidth: compact ? 88 : 120
    readonly property real channelsWidth: compact || !channels.count ? width-masterWidth-16 : Math.min(width-masterWidth-16,channels.count*124+4)
    readonly property real stripWidth: compact ? Math.max(80,(channelsWidth-16)/3) : 120
    implicitHeight: 300
    AutomationController { id: controller; timeline: root.timeline }
    ListView {
        id: channels
        objectName: "mixerChannels"
        x: Ui.Metrics.xs; y: Ui.Metrics.xs; width: root.channelsWidth; height: parent.height-2*Ui.Metrics.xs
        orientation: ListView.Horizontal
        reuseItems: true
        cacheBuffer: root.stripWidth
        spacing: Ui.Metrics.xs
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        model: controller.channels
        delegate: ChannelStrip {
            required property string channelTrackId
            property bool pooled: false
            width: root.stripWidth; height: channels.height
            visible: !pooled
            metering: !pooled && x+width>channels.contentX && x<channels.contentX+channels.width
            ListView.onPooled: { pooled=true; cancelGesture() }
            ListView.onReused: pooled=false
            trackId: channelTrackId; timeline: root.timeline; compact: root.compact
            onOpenEffect: (trackId,effectId,anchor) => effectPopover.show(trackId,effectId,anchor)
            onOpenInstrument: (trackId,anchor) => instrumentPopover.show(trackId,anchor)
        }
        Controls.ScrollBar.horizontal: Ui.ScrollBar {}
    }
    Ui.Text { role: Ui.Typography.SansLabel;
        visible: channels.count===0; x: Ui.Metrics.md; width: channels.width-2*Ui.Metrics.md
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
    InstrumentDevicePopover { id: instrumentPopover; timeline: root.timeline }
}

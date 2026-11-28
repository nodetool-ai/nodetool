pragma ComponentBehavior: Bound
import QtQuick
Item {
    id: root
    property bool scalar: false
    property bool horizontal: false
    property real levelLeft: 0
    property real levelRight: 0
    property real heldLeft: 0
    property real heldRight: 0
    property bool clippedLeft: false
    property bool clippedRight: false
    property string stateLeft: "normal"
    property string stateRight: "normal"
    readonly property int channelCount: scalar ? 2 : levels.length
    property var levels: []
    property var held: []
    property var clipped: []
    property var channelStates: []
    property real warningThreshold: 0.7
    property string accessibleName: ""
    signal resetRequested()
    Accessible.role: Accessible.Indicator
    Accessible.name: accessibleName
    Item {
        anchors.fill: parent
        Repeater {
            model: root.channelCount
            delegate: Item {
                id: channel
                required property int index
                readonly property real level: root.scalar ? (index===0 ? root.levelLeft : root.levelRight) : root.levels[index]
                readonly property real peak: root.scalar ? (index===0 ? root.heldLeft : root.heldRight) : (root.held[index] || 0)
                readonly property bool isClipped: root.scalar ? (index===0 ? root.clippedLeft : root.clippedRight) : !!root.clipped[index]
                readonly property string state: root.scalar ? (index===0 ? root.stateLeft : root.stateRight) : (root.channelStates[index] || "")
                width: root.horizontal ? root.width : (root.width-Math.max(0,root.channelCount-1)*Metrics.micro)/Math.max(1,root.channelCount)
                height: root.horizontal ? Metrics.micro : root.height
                x: root.horizontal ? 0 : index*(width+Metrics.micro)
                y: root.horizontal ? index*(height+Metrics.border) : 0
                Rectangle { visible: !root.horizontal; y: Metrics.micro; width: parent.width; height: Metrics.sm; color: channel.isClipped ? Theme.statusError : Theme.borderSubtle }
                Rectangle { y: root.horizontal ? 0 : Metrics.sm + Metrics.xs; width: parent.width; height: Math.max(0, parent.height - 2 * y); color: Theme.borderSubtle }
                Rectangle {
                    width: root.horizontal ? parent.width*Math.max(0,Math.min(1,channel.level)) : parent.width; height: root.horizontal ? parent.height : Math.max(0, parent.height - 2 * (Metrics.sm + Metrics.xs)) * Math.max(0, Math.min(1, channel.level))
                    y: root.horizontal ? 0 : parent.height - Metrics.sm - Metrics.xs - height
                    color: channel.state === "error" ? Theme.statusError : channel.state === "warning" ? Theme.statusWarning : channel.state === "normal" ? Theme.statusSuccess : channel.level >= root.warningThreshold ? Theme.statusWarning : Theme.statusSuccess
                }
                Rectangle { visible: !root.horizontal; width: parent.width; height: Metrics.border; y: Metrics.sm + Metrics.xs + Math.max(0, parent.height - 2 * (Metrics.sm + Metrics.xs)) * (1 - Math.max(0, Math.min(1, channel.peak))); color: Theme.textPrimary }
            }
        }
    }
    TapHandler { onTapped: root.resetRequested() }
}

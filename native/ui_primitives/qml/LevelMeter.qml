pragma ComponentBehavior: Bound
import QtQuick
Item {
    id: root
    property var levels: []
    property var held: []
    property var clipped: []
    property var channelStates: []
    property real warningThreshold: 0.7
    property string accessibleName: ""
    signal resetRequested()
    Accessible.role: Accessible.Indicator
    Accessible.name: accessibleName
    Row {
        anchors.fill: parent; spacing: Metrics.micro
        Repeater {
            model: root.levels.length
            delegate: Item {
                id: channel
                required property int index
                width: (root.width - Math.max(0, root.levels.length - 1) * Metrics.micro) / Math.max(1, root.levels.length)
                height: root.height
                Rectangle { y: Metrics.micro; width: parent.width; height: Metrics.sm; color: root.clipped[channel.index] ? Theme.statusError : Theme.borderSubtle }
                Rectangle { y: Metrics.sm + Metrics.xs; width: parent.width; height: Math.max(0, parent.height - 2 * y); color: Theme.borderSubtle }
                Rectangle {
                    width: parent.width; height: Math.max(0, parent.height - 2 * (Metrics.sm + Metrics.xs)) * Math.max(0, Math.min(1, root.levels[channel.index]))
                    y: parent.height - Metrics.sm - Metrics.xs - height
                    color: root.channelStates[channel.index] === "error" ? Theme.statusError : root.channelStates[channel.index] === "warning" ? Theme.statusWarning : root.channelStates[channel.index] === "normal" ? Theme.statusSuccess : root.levels[channel.index] >= root.warningThreshold ? Theme.statusWarning : Theme.statusSuccess
                }
                Rectangle { width: parent.width; height: Metrics.border; y: Metrics.sm + Metrics.xs + Math.max(0, parent.height - 2 * (Metrics.sm + Metrics.xs)) * (1 - Math.max(0, Math.min(1, root.held[channel.index] || 0))); color: Theme.textPrimary }
            }
        }
    }
    TapHandler { onTapped: root.resetRequested() }
}

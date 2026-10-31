import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "faderTaper.js" as Taper
import "meterLevels.js" as Levels

Item {
    id: root
    property string channelId: ""
    property var levels: [0, 0]
    property var held: [0, 0]
    property var clipped: [false, false]

    Timer {
        interval: 33
        running: root.visible
        repeat: true
        onTriggered: {
            const next = AutomationMeters.take(root.channelId)
            root.levels = next
            root.held = [Math.max(next[0], root.held[0] * 0.95), Math.max(next[1], root.held[1] * 0.95)]
            root.clipped = [root.clipped[0] || next[0] >= 1, root.clipped[1] || next[1] >= 1]
        }
    }
    Ui.LevelMeter {
        anchors.fill: parent
        accessibleName: qsTr("Channel level")
        levels: root.levels.map(value => Taper.dbToFaderPosition(Levels.db(value)))
        held: root.held.map(value => Taper.dbToFaderPosition(Levels.db(value)))
        clipped: root.clipped
        channelStates: root.levels.map(value => value >= 1 ? "error" : value >= 0.7 ? "warning" : "normal")
        onResetRequested: root.clipped = [false, false]
    }
}

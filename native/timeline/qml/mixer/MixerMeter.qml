import QtQuick
import NodeTool.Timeline
import "faderTaper.js" as Taper
import "meterLevels.js" as Levels
Item {
    id: root
    property string channelId: ""
    property var levels: [0,0]
    property var held: [0,0]
    property var clipped: [false,false]
    Timer {
        interval: 33; running: root.visible; repeat: true
        onTriggered: {
            var next=AutomationMeters.take(root.channelId)
            root.levels=next
            root.held=[Math.max(next[0],root.held[0]*.95),Math.max(next[1],root.held[1]*.95)]
            root.clipped=[root.clipped[0] || next[0]>=1,root.clipped[1] || next[1]>=1]
        }
    }
    Row {
        anchors.fill: parent; spacing: 2
        Repeater {
            model: 2
            delegate: Item {
                required property int index
                width: (root.width-2)/2; height: root.height
                Rectangle { y: 2; width: parent.width; height: 6; color: root.clipped[index]?Theme.error:Theme.divider }
                Rectangle { y: 10; width: parent.width; height: parent.height-20; color: Theme.divider }
                Rectangle {
                    width: parent.width
                    height: Math.max(0,parent.height-20)*Taper.dbToFaderPosition(Levels.db(root.levels[index]))
                    y: parent.height-10-height
                    color: root.levels[index]>=1?Theme.error:root.levels[index]>=.7?Theme.warning:Theme.success
                }
                Rectangle {
                    width: parent.width; height: 1
                    y: 10+Math.max(0,parent.height-20)*(1-Taper.dbToFaderPosition(Levels.db(root.held[index])))
                    color: Theme.textPrimary
                }
            }
        }
    }
    TapHandler { onTapped: root.clipped=[false,false] }
}

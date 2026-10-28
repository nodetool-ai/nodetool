import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
Item {
    id: root
    property string channelId: ""
    property string channel: ""
    property var effects: []
    property real maxListHeight: 96
    signal add(var effect)
    signal toggle(string effectId, bool enabled)
    signal open(string effectId, var anchor)
    implicitHeight: list.height + (effects.length ? Theme.spacingMicro : 0) + 20
    Flickable {
        id: list; width: parent.width; height: Math.min(contentHeight,root.maxListHeight)
        contentHeight: rows.height; clip: true
        Column {
            id: rows; width: parent.width; spacing: Theme.spacingMicro
            Repeater {
                model: root.effects
                delegate: Rectangle {
                    required property var modelData
                    width: rows.width; height: 20; color: Theme.actionHover; radius: Theme.radiusSm
                    Controls.ToolButton {
                        objectName: "bypass-" + modelData.id
                        width: 20; height: 20; text: "⏻"
                        palette.buttonText: modelData.enabled ? Theme.success : Theme.textDisabled
                        Accessible.name: (modelData.enabled?"Bypass ":"Enable ")+effectName.text
                        onClicked: root.toggle(modelData.id,!modelData.enabled)
                    }
                    Controls.ToolButton {
                        id: effectName; objectName: "open-effect-"+modelData.id
                        x: 22; width: parent.width-22; height: 20
                        text: ({gain:"Gain",eq3:"3-Band EQ",filter:"Filter",compressor:"Compressor"})[modelData.type] || modelData.type
                        font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmaller
                        palette.buttonText: modelData.enabled ? Theme.textPrimary : Theme.textDisabled
                        onClicked: root.open(modelData.id,effectName)
                    }
                }
            }
        }
        Controls.ScrollBar.vertical: Controls.ScrollBar {}
    }
    Controls.ToolButton {
        id: addButton; objectName: "add-effect-" + root.channelId
        y: list.height + (root.effects.length ? Theme.spacingMicro : 0)
        width: parent.width; height: 20; text: "+"
        Accessible.name: "Add effect to " + root.channel
        background: Rectangle { color: addButton.hovered?Theme.actionSelected:"transparent"; border.color: Theme.divider; radius: Theme.radiusSm }
        onClicked: addMenu.open()
        Controls.Menu {
            palette.window: Theme.backgroundPaper; palette.windowText: Theme.textPrimary
            palette.base: Theme.backgroundDefault; palette.text: Theme.textPrimary
            palette.highlight: Theme.actionSelected; palette.highlightedText: Theme.textPrimary
            font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; font.weight: Font.Medium
            id: addMenu
            Repeater {
                model: [{type:"gain",label:"Gain"},{type:"eq3",label:"3-Band EQ"},{type:"filter",label:"Filter"},{type:"compressor",label:"Compressor"}]
                delegate: Controls.MenuItem {
                    implicitHeight: 28
                    required property var modelData
                    objectName: "add-" + modelData.type + "-" + root.channelId
                    text: modelData.label; onTriggered: root.add(modelData.type)
                }
            }
        }
    }
}

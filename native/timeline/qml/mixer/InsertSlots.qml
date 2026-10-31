import QtQuick
import NodeTool.UiPrimitives as Ui
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
    implicitHeight: list.height + (effects.length ? Ui.Metrics.micro : 0) + Ui.Metrics.compact
    Flickable {
        id: list; width: parent.width; height: Math.min(contentHeight,root.maxListHeight)
        contentHeight: rows.height; clip: true
        Column {
            id: rows; width: parent.width; spacing: Ui.Metrics.micro
            Repeater {
                model: root.effects
                delegate: Ui.Surface {
                    required property var modelData
                    width: rows.width; height: Ui.Metrics.compact
                    Ui.ToolbarIconButton {
                        objectName: "bypass-" + modelData.id
                        width: Ui.Metrics.compact
                        iconName: "power"
                        accessibleName: (modelData.enabled ? "Bypass " : "Enable ") + effectName.text
                        checkable: true
                        checked: !!modelData.enabled
                        onClicked: root.toggle(modelData.id, !modelData.enabled)
                    }
                    Ui.EditorButton {
                        id: effectName; objectName: "open-effect-" + modelData.id
                        x: Ui.Metrics.compact; width: parent.width - x
                        density: Ui.EditorButton.Compact
                        variant: Ui.EditorButton.Flat
                        contentAlignment: Qt.AlignLeft
                        text: ({gain:"Gain",eq3:"3-Band EQ",filter:"Filter",compressor:"Compressor"})[modelData.type] || modelData.type
                        textTone: modelData.enabled ? Ui.Text.Primary : Ui.Text.Disabled
                        onClicked: root.open(modelData.id, effectName)
                    }
                }
            }
        }
        Controls.ScrollBar.vertical: Ui.ScrollBar {}
    }
    Ui.EditorButton {
        id: addButton; objectName: "add-effect-" + root.channelId
        y: list.height + (root.effects.length ? Ui.Metrics.micro : 0)
        width: parent.width; density: Ui.EditorButton.Compact; iconName: "add"
        accessibleName: "Add effect to " + root.channel
        menuButton: true
        menuExpanded: addMenu.visible
        onClicked: addMenu.openAt(addButton)
        Ui.ContextMenu {
            id: addMenu
            returnFocusTo: addButton
            Repeater {
                model: [{type:"gain",label:"Gain"},{type:"eq3",label:"3-Band EQ"},{type:"filter",label:"Filter"},{type:"compressor",label:"Compressor"}]
                delegate: Ui.MenuItem {
                    required property var modelData
                    objectName: "add-" + modelData.type + "-" + root.channelId
                    text: modelData.label; onTriggered: root.add(modelData.type)
                }
            }
        }
    }
}

import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import NodeTool.Timeline
import "AudioEffectsKnobs.js" as Effects

Column {
    id: root
    property var effect: ({})
    property var timeline: null
    property string clipId: ""
    property double generation: 0
    property bool isFirst: false
    property bool isLast: false
    property bool expanded: false
    readonly property string name: Effects.labels[effect.type] || ""
    signal expand()
    signal patch(var patch)
    signal remove()
    signal move(int delta)
    spacing: Theme.spacingMicro
    Rectangle { width: parent.width; height: 1; color: Theme.divider }
    RowLayout {
        width: parent.width
        spacing: Theme.spacingMicro
        Controls.CheckBox {
            objectName: "audioEffectEnabled-" + root.effect.id
            implicitWidth: Theme.controlXs
            implicitHeight: Theme.controlXs
            checked: !!root.effect.enabled
            Accessible.name: root.name + " enabled"
            onClicked: root.patch({enabled: checked})
        }
        Controls.Button {
            objectName: "audioEffectExpand-" + root.effect.id
            Layout.fillWidth: true
            implicitHeight: Theme.controlXs
            flat: true
            text: (root.expanded ? "⌄ " : "› ") + root.name
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            onClicked: root.expand()
        }
        Controls.ToolButton {
            objectName: "audioEffectUp-" + root.effect.id
            implicitWidth: Theme.controlXs
            implicitHeight: Theme.controlXs
            text: "↑"
            enabled: !root.isFirst
            Accessible.name: "Move " + root.name + " up"
            Controls.ToolTip.text: "Move earlier in the chain"
            Controls.ToolTip.visible: hovered
            onClicked: root.move(-1)
        }
        Controls.ToolButton {
            objectName: "audioEffectDown-" + root.effect.id
            implicitWidth: Theme.controlXs
            implicitHeight: Theme.controlXs
            text: "↓"
            enabled: !root.isLast
            Accessible.name: "Move " + root.name + " down"
            Controls.ToolTip.text: "Move later in the chain"
            Controls.ToolTip.visible: hovered
            onClicked: root.move(1)
        }
        Controls.ToolButton {
            objectName: "audioEffectRemove-" + root.effect.id
            implicitWidth: Theme.controlXs
            implicitHeight: Theme.controlXs
            text: "×"
            Accessible.name: "Remove " + root.name
            Controls.ToolTip.text: Accessible.name
            Controls.ToolTip.visible: hovered
            onClicked: root.remove()
        }
    }
    Loader {
        active: root.expanded
        width: parent.width
        sourceComponent: AudioEffectsFields {
            effect: root.effect
            timeline: root.timeline
            clipId: root.clipId
            generation: root.generation
            onPatch: patch => root.patch(patch)
        }
    }
}

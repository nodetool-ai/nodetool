import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import NodeTool.Timeline
import "AudioEffectsKnobs.js" as Effects
import NodeTool.UiPrimitives as Ui

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
    spacing: Ui.Metrics.micro
    Ui.Separator { width: parent.width }
    RowLayout {
        width: parent.width
        spacing: Ui.Metrics.micro
        Ui.CheckBox {
            id: enabledBox
            objectName: "audioEffectEnabled-" + root.effect.id
            Binding { target: enabledBox; property: "checked"; value: !!root.effect.enabled }
            accessibleName: root.name + " enabled"
            onCheckedChangedByUser: checked => root.patch({enabled: checked})
        }
        Ui.EditorButton {
            objectName: "audioEffectExpand-" + root.effect.id
            Layout.fillWidth: true
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            contentAlignment: Qt.AlignLeft
            text: root.name
            trailingIconName: root.expanded ? "arrowDropDown" : "navigateNext"
            accessibleName: (root.expanded ? "Collapse " : "Expand ") + root.name
            onClicked: root.expand()
        }
        Ui.ToolbarIconButton {
            objectName: "audioEffectUp-" + root.effect.id
            iconName: "arrowUpward"
            enabled: !root.isFirst
            accessibleName: "Move " + root.name + " up"
            description: "Move earlier in the chain"
            onClicked: root.move(-1)
        }
        Ui.ToolbarIconButton {
            objectName: "audioEffectDown-" + root.effect.id
            iconName: "arrowDownward"
            enabled: !root.isLast
            accessibleName: "Move " + root.name + " down"
            description: "Move later in the chain"
            onClicked: root.move(1)
        }
        Ui.ToolbarIconButton {
            objectName: "audioEffectRemove-" + root.effect.id
            iconName: "close"
            accessibleName: "Remove " + root.name
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

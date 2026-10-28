import QtQuick
import QtQuick.Controls as Controls
import NodeTool.Timeline
import "automationTargets.js" as Targets
Rectangle {
    id: root
    property TimelineModel timeline: null
    property var track: ({})
    property string query: ""
    readonly property var options: {
        var used = (track.automation || []).map(l => Targets.key(l.target))
        return Targets.automationTargetSpecs(track).filter(s => !used.includes(s.key) && (s.group+" "+s.label).toLowerCase().includes(root.query.toLowerCase()))
    }
    objectName: "automation-add-" + track.id
    height: 40; color: Theme.backgroundPaper
    AutomationController { id: controller; timeline: root.timeline; trackId: root.track.id || "" }
    Controls.ComboBox {
        id: picker
        objectName: "automation-picker-" + root.track.id
        anchors.fill: parent; anchors.leftMargin: Theme.spacingXl; anchors.rightMargin: Theme.spacingSm
        anchors.topMargin: Theme.spacingMd; anchors.bottomMargin: Theme.spacingMd
        palette.button: Theme.backgroundDefault; palette.base: Theme.backgroundDefault
        palette.text: Theme.textPrimary; palette.buttonText: Theme.textPrimary
        palette.window: Theme.backgroundPaper; palette.windowText: Theme.textPrimary
        palette.highlight: Theme.primary; palette.highlightedText: Theme.textPrimary
        contentItem: Controls.TextField {
            text: picker.editText; placeholderText: "Automate a parameter"; selectByMouse: true
            color: Theme.textPrimary; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall
            onTextEdited: { root.query=text; picker.editText=text }
            background: Rectangle { color: Theme.backgroundDefault; border.color: Theme.divider; radius: Theme.radiusSm }
        }
        model: root.options; textRole: "label"; currentIndex: -1
        displayText: "Automate a parameter"; editable: true
        enabled: !root.track.locked
        Accessible.name: "Automate a parameter"
        delegate: Controls.ItemDelegate { required property var modelData; objectName: "automation-option-"+modelData.key; font.family: Theme.sansFamily; font.pixelSize: Theme.fontSizeSmall; width: parent.width; text: modelData.group + " · " + modelData.label }
        onActivated: index => { controller.addLane(root.options[index].target); currentIndex = -1; root.query=""; editText = "" }
    }
    Rectangle { anchors.bottom: parent.bottom; width: parent.width; height: 1; color: Theme.divider }
}

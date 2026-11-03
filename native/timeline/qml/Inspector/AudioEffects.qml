pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "AudioEffectsKnobs.js" as Effects
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "audioEffectsSection"
    property var timelineModel: null
    property var controller: null
    property var gestures: null
    property TimelineModel timeline: timelineModel
    property var selection: gestures ? gestures.selection : []
    readonly property var clip: controller ? controller.clip : reader.clip
    readonly property var effects: clip.audioEffects || []
    property alias open: section.open
    visible: !!clip.id && (clip.mediaType === "audio" || clip.mediaType === "midi")
    implicitWidth: visible ? TimelineMetrics.trackHeaderWidth : 0
    implicitHeight: visible ? section.implicitHeight : 0
    width: implicitWidth
    height: implicitHeight

    function edit(name, payload) {
        if (timeline && clip.id) timeline.applyEdit(name, Object.assign({clipId: clip.id}, payload))
    }
    function add(type) {
        edit("addClipAudioEffect", {type: type})
    }
    ClipAudio { id: reader; timeline: root.timeline; selection: root.selection }
    InspectorSection {
        id: section
        width: parent.width
        title: "Audio effects"
        icon: "graphicEq"
        defaultOpen: false
        meta: root.effects.length ? root.effects.filter(effect => effect.enabled).length + "/" + root.effects.length + " active" : ""
        Ui.EditorButton {
            id: addButton
            objectName: "audioEffectsAdd"
            density: Ui.EditorButton.Compact
            variant: Ui.EditorButton.Flat
            text: "Add effect"
            onClicked: addMenu.openAt(addButton)
            Ui.ContextMenu {
                id: addMenu
                Instantiator {
                    model: Effects.types
                    delegate: Ui.MenuItem {
                        required property string modelData
                        objectName: "audioEffectsAdd-" + modelData
                        text: Effects.labels[modelData]
                        onTriggered: root.add(modelData)
                    }
                    onObjectAdded: (index, object) => addMenu.insertItem(index, object)
                    onObjectRemoved: (index, object) => addMenu.removeItem(object)
                }
            }
        }
        Ui.Text {
            visible: !root.effects.length
            width: parent.width
            text: "Effects play live and render in the export."
            wrapMode: Text.WordWrap
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Secondary
        }
    }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "AudioEffectsKnobs.js" as Effects

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
    property string expandedId: ""
    visible: !!clip.id && (clip.mediaType === "audio" || clip.mediaType === "midi")
    implicitWidth: visible ? Theme.trackHeaderWidth : 0
    implicitHeight: visible ? section.implicitHeight : 0
    width: implicitWidth
    height: implicitHeight
    onEffectsChanged: if (!effects.some(effect => effect.id === expandedId)) expandedId = ""

    function edit(name, payload) {
        if (timeline && clip.id) timeline.applyEdit(name, Object.assign({clipId: clip.id}, payload))
    }
    function add(type) {
        edit("addClipAudioEffect", {type: type})
        if (effects.length) expandedId = effects[effects.length - 1].id
    }
    ClipAudio { id: reader; timeline: root.timeline; selection: root.selection }
    InspectorSection {
        id: section
        width: parent.width
        title: "Audio effects"
        icon: Icons.graphicEq
        defaultOpen: false
        meta: root.effects.length ? root.effects.filter(effect => effect.enabled).length + "/" + root.effects.length + " active" : ""
        Button {
            id: addButton
            objectName: "audioEffectsAdd"
            implicitHeight: Theme.controlXs
            flat: true
            text: "Add effect"
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
            onClicked: addMenu.popup()
            Menu {
                id: addMenu
                Instantiator {
                    model: Effects.types
                    delegate: MenuItem {
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
        Text {
            visible: !root.effects.length
            width: parent.width
            text: "Effects play live and render in the export."
            wrapMode: Text.WordWrap
            color: Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmall
        }
        Repeater {
            model: root.effects
            delegate: AudioEffectsRow {
                required property var modelData
                required property int index
                width: parent.width
                timeline: root.timeline
                clipId: root.clip.id || ""
                generation: reader.generation
                effect: modelData
                isFirst: index === 0
                isLast: index === root.effects.length - 1
                expanded: effect.id === root.expandedId
                onExpand: root.expandedId = expanded ? "" : effect.id
                onPatch: patch => root.edit("patchClipAudioEffect", {effectId: effect.id, patch: patch})
                onRemove: root.edit("removeClipAudioEffect", {effectId: effect.id})
                onMove: delta => root.edit("moveClipAudioEffect", {effectId: effect.id, delta: delta})
            }
        }
    }
}

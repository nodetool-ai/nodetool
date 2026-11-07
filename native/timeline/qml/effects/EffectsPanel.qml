// nt-panel: slot=left id=effects order=11 title="Effects"
// The effects a clip can take. Double-click one to add it to the selection, or drag it onto a clip.
// Effect Controls edits an effect once it is on a clip, and the Color panel adds the grades.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import "../../src/edit/clipeffects/ClipEffectsCatalog.js" as Catalog
import "../Inspector/AudioEffectsKnobs.js" as AudioKnobs
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: root
    objectName: "effectsPanel"
    implicitWidth: 320
    implicitHeight: parent && parent.parent ? parent.parent.height : 480
    color: Ui.Theme.surfaceCanvas
    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined) return item
            item = item.parent
        }
        return null
    }
    function findGestures(item) {
        if (!item) return null
        if (item.gestures !== undefined) return item.gestures
        const children = item.children || []
        for (let i = 0; i < children.length; ++i) {
            const found = findGestures(children[i])
            if (found) return found
        }
        return null
    }
    property var editor: null
    property var gestures: null
    function attach() {
        editor = editorAbove()
        gestures = findGestures(editor)
    }
    Component.onCompleted: Qt.callLater(attach)
    onParentChanged: Qt.callLater(attach)
    readonly property var timelineModel: editor ? editor.timeline : null
    readonly property var selectionIds: gestures ? gestures.selection : []
    InspectorEdits { id: edits; model: root.timelineModel }
    // Read only while the panel shows, because the document changes with every preview.
    readonly property var document: root.visible ? edits.document : ({})
    readonly property var selectedClips: (document.clips || []).filter(clip => selectionIds.indexOf(clip.id) >= 0)
    property string status: ""
    property bool statusIsWarning: false

    function accepts(kind, clip) {
        const sound = clip.mediaType === "audio" || clip.mediaType === "midi"
        return kind === "audio" ? sound : !sound
    }
    function editable(clip) {
        return !clip.locked && !(document.tracks || []).some(track => track.id === clip.trackId && track.locked)
    }
    function canApply(kind, clip) { return accepts(kind, clip) && editable(clip) }
    // Why double-clicking this kind of effect does nothing now, or "" when it works.
    function disabledReason(kind) {
        if (selectionIds.length === 0) return "Select a clip on the timeline first."
        const fitting = selectedClips.filter(clip => accepts(kind, clip))
        if (fitting.length === 0) return kind === "audio" ? "Select an audio clip for this effect." : "Select a video, image or text clip for this effect."
        if (!fitting.some(clip => editable(clip))) return "Unlock the clip or its track first."
        return ""
    }
    function applyTo(kind, type, label, clips) {
        const payload = kind === "audio"
            ? {audio: clips.map(clip => ({clipId: clip.id, type: type}))}
            : {visual: clips.map(clip => ({clipId: clip.id, effect: Catalog.makeEffect(type, ClipEffectsUi.newId())}))}
        if (!root.timelineModel || !root.timelineModel.applyEdit("applyClipEffects", payload)) return false
        statusIsWarning = false
        status = "Added " + label + (clips.length === 1 ? " to " + (clips[0].name || "the clip") : " to " + clips.length + " clips") + ". Edit it in Effect Controls."
        return true
    }
    function applyToSelection(kind, type, label) {
        const reason = disabledReason(kind)
        if (reason !== "") {
            statusIsWarning = true
            status = reason
            return false
        }
        return applyTo(kind, type, label, selectedClips.filter(clip => canApply(kind, clip)))
    }
    readonly property string query: search.text.trim().toLowerCase()
    function matching(list) { return list.filter(effect => effect.label.toLowerCase().includes(query)) }
    readonly property var videoEffects: matching(Catalog.addableEffects)
    readonly property var audioEffects: matching(AudioKnobs.types.map(type => ({value: type, label: AudioKnobs.labels[type]})))

    Ui.TextField {
        id: search
        objectName: "effectsSearch"
        x: Ui.Metrics.lg
        y: Ui.Metrics.md
        width: root.width - 2 * Ui.Metrics.lg
        placeholderText: "Search effects"
        accessibleName: "Search effects"
        density: Ui.EditorButton.Compact
    }
    Flickable {
        id: viewport
        objectName: "effectsPanelViewport"
        x: Ui.Metrics.lg
        y: search.y + search.height + Ui.Metrics.md
        width: root.width - 2 * Ui.Metrics.lg
        height: footer.y - y
        contentWidth: width
        contentHeight: content.height
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        ScrollBar.vertical: Ui.ScrollBar { id: scrollBar }
        Column {
            id: content
            width: viewport.width - scrollBar.width
            InspectorSection {
                objectName: "effectsPanelVideo"
                width: parent.width
                title: "Video"
                divider: false
                visible: root.videoEffects.length > 0
                Repeater {
                    model: root.videoEffects
                    delegate: EffectsPanelRow {
                        required property var modelData
                        objectName: "effectsAdd_" + modelData.value
                        width: parent.width
                        kind: "video"
                        effectType: modelData.value
                        label: modelData.label
                        panel: root
                    }
                }
            }
            InspectorSection {
                objectName: "effectsPanelAudio"
                width: parent.width
                title: "Audio"
                visible: root.audioEffects.length > 0
                Repeater {
                    model: root.audioEffects
                    delegate: EffectsPanelRow {
                        required property var modelData
                        objectName: "audioEffectsAdd-" + modelData.value
                        width: parent.width
                        kind: "audio"
                        effectType: modelData.value
                        label: modelData.label
                        panel: root
                    }
                }
            }
            Ui.Text {
                objectName: "effectsPanelNoMatch"
                width: parent.width
                visible: root.videoEffects.length === 0 && root.audioEffects.length === 0
                text: "No matching effects"
                horizontalAlignment: Text.AlignHCenter
                role: Ui.Typography.SansLabel
                tone: Ui.Text.Secondary
            }
        }
    }
    Column {
        id: footer
        objectName: "effectsPanelFooter"
        x: Ui.Metrics.lg
        y: root.height - height
        width: root.width - 2 * Ui.Metrics.lg
        bottomPadding: Ui.Metrics.md
        topPadding: Ui.Metrics.md
        Ui.Text {
            objectName: "effectsPanelStatus"
            width: parent.width
            text: root.status !== "" ? root.status : "Double-click an effect to add it to the selection, or drag it onto a clip. The Color panel adds grades."
            wrapMode: Text.WordWrap
            role: Ui.Typography.SansCaption
            tone: root.statusIsWarning ? Ui.Text.Warning : Ui.Text.Secondary
        }
    }
}

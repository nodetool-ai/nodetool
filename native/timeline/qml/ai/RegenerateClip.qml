import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

RowLayout {
    id: root
    required property TimelineModel timeline
    required property ClipGestureController gestures
    required property var controller
    readonly property string clipId: gestures && gestures.selection.length === 1 ? gestures.selection[0] : ""
    readonly property var selectedClip: inspector.clip
    readonly property bool sourceRequired: ["image-to-image", "image-to-video"].includes(selectedClip.bindingKind)
    readonly property bool sourceAvailable: source.clip.mediaType === "image" && !!source.clip.currentAssetId
    visible: clipId !== "" && ["text-to-image", "image-to-image", "text-to-video", "image-to-video", "text-to-audio", "text-to-music"].includes(selectedClip.bindingKind)
             && !!selectedClip.currentAssetId && (!sourceRequired || sourceAvailable)
    ClipInspectorController { id: source; timeline: root.timeline; clipId: root.selectedClip.sourceClipId || "" }
    ClipInspectorController { id: inspector; timeline: root.timeline; clipId: root.clipId }
    Ui.Text { role: Ui.Typography.SansLabel; text: "New take for " + (root.selectedClip.name || "clip"); tone: Ui.Text.Secondary; Layout.fillWidth: true; elide: Text.ElideRight }
    Ui.EditorButton {
        objectName: "regenerateClip"
        text: "Generate new take"
        enabled: root.controller.ready && !root.controller.busy && !inspector.locked
        onClicked: root.controller.regenerate(root.clipId)
    }
}

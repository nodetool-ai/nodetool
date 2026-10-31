import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../Inspector/primitives" as P

P.InspectorSection {
    id: root
    objectName: "inspectorAiSection"
    property var timelineModel: null
    property var gestures: null
    property var controller: null
    // Use the revision in the result so late host registration refreshes the binding.
    readonly property var host: AiHostRegistry.revision > 0 ? AiHostRegistry.host(gestures) : null
    readonly property var clip: controller ? controller.clip : ({})
    title: "AI"
    defaultOpen: true
    visible: !!host && !!clip.id && (clip.mediaType === "video" || clip.mediaType === "image" ||
             (clip.mediaType === "audio" && (!!clip.workflowId || !!clip.scriptLineId || !!clip.bindingKind)))
    Loader {
        width: parent.width
        active: !!root.host && !!root.timelineModel && !!root.gestures
        sourceComponent: Column {
            width: parent.width
            spacing: Ui.Metrics.md
            WorkflowClip { width: parent.width; timeline: root.timelineModel; gestures: root.gestures; controller: root.host.generationController }
            RegenerateClip { width: parent.width; timeline: root.timelineModel; gestures: root.gestures; controller: root.host.generationController }
            LineDelivery { width: parent.width; timeline: root.timelineModel; gestures: root.gestures; controller: root.host.generationController }
            ClipOperations { width: parent.width; timeline: root.timelineModel; gestures: root.gestures; controller: root.host.generationController }
            Ui.EditorButton {
                objectName: "inspectorReviewTakes"
                text: "Review takes"
                onClicked: root.host.openReview()
            }
        }
    }
}

// nt-panel: slot=rulerOverlay id=musicContextBracket order=10 title="Music context"
// The dashed bracket under the ruler over the bars the model hears
// (docs/MUSIC-MODE.md sections 9.2 and 9.3, the music mode mockup): the
// planner's context window for a Regenerate or Add instrument selection, or,
// while the record of the active take is open in the take list, that take's
// context. The label reads "Model hears bars 1–5". It reads the music panel's
// MusicPanelModel, so it follows the operation the panel shows, and takes no
// pointer input.
import QtQuick
import QtQuick.Shapes
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "MusicLayout.js" as MusicLayout
import "../assets/AssetContext.js" as Context

Item {
    id: root
    objectName: "musicContextBracket"
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property var editor: null
    property var panel: null
    readonly property bool musicLayout: !!editor && !!editor.dockStore && editor.dockStore.workspace === "Music"
    readonly property var plan: panel ? panel.planModel : null
    // {label, startFrame, endFrame} or null.
    readonly property var context: {
        if (!musicLayout || !panel) return null
        if (panel.recordContext) return panel.recordContext
        if (plan && plan.contextLabel !== "" && plan.contextEndFrame > plan.contextStartFrame)
            return {label: plan.contextLabel, startFrame: plan.contextStartFrame, endFrame: plan.contextEndFrame}
        return null
    }
    readonly property double msPerPx: viewState ? viewState.msPerPx : 10
    readonly property double scrollPx: viewState ? viewState.scrollLeftPx : 0
    readonly property double startX: context ? context.startFrame / 48 / msPerPx - scrollPx : 0
    readonly property double endX: context ? context.endFrame / 48 / msPerPx - scrollPx : 0
    readonly property string label: context ? context.label : ""

    function attach() {
        if (!editor) editor = MusicLayout.editorOf(root)
        if (editor && !panel) panel = Context.itemNamed(editor, "musicPanel")
    }
    Component.onCompleted: attach()
    // The panel can load after the ruler, and a layout change can recreate it.
    Timer {
        interval: 200
        repeat: true
        running: !root.editor || (root.musicLayout && !root.panel)
        onTriggered: root.attach()
    }

    Item {
        id: bracket
        objectName: "musicContextBracketShape"
        visible: root.context !== null && root.endX > 0 && root.startX < root.width
        x: root.startX
        y: root.height - height - Ui.Metrics.xs
        width: Math.max(Ui.Metrics.border, root.endX - root.startX)
        height: Ui.Metrics.md
        Shape {
            anchors.fill: parent
            ShapePath {
                strokeColor: Ui.Theme.borderStrong
                strokeWidth: Ui.Metrics.border
                strokeStyle: ShapePath.DashLine
                dashPattern: [3, 2]
                fillColor: "transparent"
                startX: 0
                startY: 0
                PathLine { x: 0; y: bracket.height }
                PathLine { x: bracket.width; y: bracket.height }
                PathLine { x: bracket.width; y: 0 }
            }
        }
    }
    Rectangle {
        objectName: "musicContextLabelChip"
        visible: bracket.visible
        x: Math.max(0, root.startX) + Ui.Metrics.xs
        y: bracket.y - height
        width: contextText.implicitWidth + 2 * Ui.Metrics.xs
        height: contextText.implicitHeight
        radius: Ui.Metrics.radiusControl
        color: Ui.Theme.surfacePanel
        Ui.Text {
            id: contextText
            objectName: "musicContextLabel"
            anchors.centerIn: parent
            text: root.label
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
        }
    }
}

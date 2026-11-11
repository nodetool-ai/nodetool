// nt-panel: slot=overlay id=effectDrop order=21 title="Effect drop"
// Takes an effect dragged from the Effects panel and adds it to the clip under the pointer.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../assets/AssetContext.js" as Context

Item {
    id: overlay
    objectName: "effectDropOverlay"
    property var region: null
    property var explorer: null
    property var timelineModel: null
    readonly property var browser: explorer ? explorer.browser : null
    property string warning: ""
    Component.onCompleted: Qt.callLater(() => {
        const editor = Context.editorFor(overlay)
        overlay.region = Context.itemNamed(editor, "tracksRegion")
        overlay.explorer = Context.itemNamed(editor, "assetExplorer")
        overlay.timelineModel = editor ? editor.timeline : null
    })
    InspectorEdits { id: edits; model: overlay.timelineModel }
    function clipAt(x, y) {
        if (!region || !browser || y >= region.lanesHeight - TimelineMetrics.toolbarHeight) return null
        const view = region.viewState
        const trackId = browser.trackAt(region.rows, y + view.scrollTopPx)
        const ms = (x + view.scrollLeftPx) * view.msPerPx
        return (edits.document.clips || []).find(clip => clip.trackId === trackId && ms >= clip.startMs && ms < clip.startMs + clip.durationMs) || null
    }
    DropArea {
        id: effectDrop
        objectName: "effectLaneDropArea"
        parent: overlay.region || overlay
        x: overlay.region ? overlay.region.headerWidth : 0
        y: TimelineMetrics.toolbarHeight + TimelineMetrics.rulerHeight
        width: overlay.region ? overlay.region.width - overlay.region.headerWidth : 0
        height: overlay.region ? overlay.region.lanesHeight : 0
        keys: ["application/x-nodetool-effect"]
        readonly property var targetClip: containsDrag ? overlay.clipAt(drag.x, drag.y) : null
        readonly property bool dropAllowed: !!targetClip && !!drag.source && drag.source.canApplyTo(targetClip)
        onDropped: drop => {
            const clip = overlay.clipAt(drop.x, drop.y)
            if (clip && drop.source && drop.source.canApplyTo(clip)) {
                overlay.warning = ""
                if (drop.source.applyToClip(clip)) drop.acceptProposedAction()
                return
            }
            overlay.warning = clip ? "This clip cannot take this effect." : "Drop the effect onto a clip."
            dismiss.restart()
        }
        Rectangle {
            visible: effectDrop.containsDrag
            anchors.horizontalCenter: parent.horizontalCenter
            y: Math.max(Ui.Metrics.sm, Math.min(parent.height - height - Ui.Metrics.sm, effectDrop.drag.y + Ui.Metrics.sm))
            width: hint.implicitWidth + 2 * Ui.Metrics.md
            height: hint.implicitHeight + 2 * Ui.Metrics.sm
            radius: Ui.Metrics.radiusControl
            color: Ui.Theme.surfacePanel
            Ui.Text {
                id: hint
                anchors.centerIn: parent
                text: !effectDrop.targetClip ? "Drop onto a clip" : effectDrop.dropAllowed ? "Add to " + (effectDrop.targetClip.name || "this clip") : "This clip cannot take this effect"
                role: Ui.Typography.SansLabel
            }
        }
    }
    Timer { id: dismiss; interval: 3000; onTriggered: overlay.warning = "" }
    Ui.Text {
        objectName: "effectDropWarning"
        anchors.horizontalCenter: parent.horizontalCenter
        y: overlay.region ? overlay.region.mapToItem(overlay, 0, effectDrop.y).y : 0
        text: overlay.warning
        visible: text !== ""
        role: Ui.Typography.SansLabel
        tone: Ui.Text.Warning
    }
}

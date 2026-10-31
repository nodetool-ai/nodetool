pragma ComponentBehavior: Bound
import QtQuick
import QtQml
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.ContextMenu {
    id: menu
    required property ClipGestureController gestures
    property var context: ({})
    property bool hasGap: false
    readonly property var actionContext: Object.assign({}, context, { kind: "lane" })
    readonly property var webItems: {
        const items = []
        if (["overlay", "video"].includes(context.trackType)) items.push({ action: "addText", label: "Add text", icon: "title" })
        if (hasGap) items.push({ action: "closeGapAt", label: "Close gap",
                                 icon: "closeGap" })
        return items
    }
    // Reuse the existing raw-document reader, taking one snapshot per open as the web does.
    TransitionController { id: documentReader; model: menu.gestures ? menu.gestures.timeline : null }
    function openAt(px, py) {
        const clips = documentReader.document.clips ?? []
        let prevEnd = 0
        let nextStart = Infinity
        let occupied = false
        for (const clip of clips) {
            if (clip.trackId !== context.trackId) continue
            const end = clip.startMs + clip.durationMs
            if (clip.startMs <= context.timeMs && end > context.timeMs) occupied = true
            if (end <= context.timeMs) prevEnd = Math.max(prevEnd, end)
            else nextStart = Math.min(nextStart, clip.startMs)
        }
        hasGap = !occupied && Number.isFinite(nextStart) && nextStart > prevEnd
        // Let the Instantiator settle the menu's size before placing the popup.
        Qt.callLater(() => { if (count > 0) popup(px, py) })
    }
    objectName: "registryContextMenu-lane"
    popupType: Popup.Item
    Instantiator {
        model: menu.webItems
        delegate: MenuActionItem {
            required property var modelData
            objectName: "laneMenu-" + (modelData.action === "closeGapAt" ? "closeGap" : modelData.action)
            text: modelData.label
            iconName: modelData.icon
            actionName: modelData.action
            actionContext: menu.actionContext
            gestures: menu.gestures
        }
        onObjectAdded: (index, object) => menu.insertItem(index, object)
        onObjectRemoved: (index, object) => menu.removeItem(object)
    }
    RegistryMenuItems { menu: menu; kind: "lane"; context: menu.actionContext; gestures: menu.gestures }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQml
import QtQuick.Controls
import NodeTool.Timeline

Menu {
    id: menu
    required property ClipGestureController gestures
    property var context: ({})
    property bool hasGap: false
    readonly property var actionContext: Object.assign({}, context, { kind: "lane" })
    readonly property var webItems: {
        const items = []
        if (["overlay", "video"].includes(context.trackType)) items.push({ action: "addText", label: "Add text", icon: Icons.title })
        if (hasGap) items.push({ action: "closeGapAt", label: "Close gap",
                                 icon: "M4 9v2h16V9zm12-5-1.41-1.41L13 4.17V1h-2v3.19L9.39 2.61 8 4l4 4zM4 14h16v-2H4zm4 5 1.39 1.39L11 18.81V22h2v-3.17l1.59 1.59L16 19l-4-4z" })
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
    width: Math.max(180, implicitContentWidth + 2 * Theme.spacingXs)
    padding: Theme.spacingXs
    popupType: Popup.Item
    background: Rectangle { color: Theme.backgroundPaper; radius: Theme.radiusLg; border.color: Theme.divider }
    Instantiator {
        model: menu.webItems
        delegate: MenuActionItem {
            required property var modelData
            objectName: "laneMenu-" + (modelData.action === "closeGapAt" ? "closeGap" : modelData.action)
            text: modelData.label
            iconPath: modelData.icon
            actionName: modelData.action
            actionContext: menu.actionContext
            gestures: menu.gestures
        }
        onObjectAdded: (index, object) => menu.insertItem(index, object)
        onObjectRemoved: (index, object) => menu.removeItem(object)
    }
    RegistryMenuItems { menu: menu; kind: "lane"; context: menu.actionContext; gestures: menu.gestures }
}

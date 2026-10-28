pragma ComponentBehavior: Bound
import QtQuick
import QtQml
import QtQuick.Controls
import NodeTool.Timeline

Menu {
    id: menu
    required property ClipGestureController gestures
    property var context: ({})
    readonly property var actionContext: Object.assign({}, context, { kind: "clip", clipIds: [context.clipId] })
    readonly property var registeredItems: MenuRegistry.query("clip", actionContext).map(
        item => Object.assign({}, item, { registered: true }))
    readonly property var webItems: {
        const clip = context.clip
        if (!clip) return []
        const items = [
            { action: "splitAtPlayhead", label: "Split at playhead", icon: Icons.contentCut },
            { action: "duplicate", label: "Duplicate", icon: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z" }
        ]
        const transition = (clip.transitionIn?.durationMs ?? 0) > 0
        items.push({ action: transition ? "removeTransition" : "applyDefaultTransition",
                       label: transition ? "Remove transition" : "Cross-fade in",
                       icon: "M11 9h2v2h-2zm-2 2h2v2H9zm4 0h2v2h-2zm2-2h2v2h-2zM7 9h2v2H7zm12-6H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 18H7v-2h2zm4 0h-2v-2h2zm4 0h-2v-2h2zm2-7h-2v2h2v2h-2v-2h-2v2h-2v-2h-2v2H9v-2H7v2H5v-2h2v-2H5V5h14z" })
        if (["audio", "video", "midi"].includes(clip.mediaType)) {
            const fades = ((clip.fadeInMs ?? 0) || (clip.fadeOutMs ?? 0)) > 0
            items.push({ action: fades ? "removeFades" : "applyFades",
                           label: fades ? "Remove fades" : "Fade in and out", icon: Icons.graphicEq })
        }
        items.push({ action: "toggleClipLock", label: clip.locked ? "Unlock" : "Lock",
                       icon: clip.locked ? Icons.lock : Icons.lockOpen })
        if (!clip.locked) {
            const disabled = ["audio", "midi"].includes(clip.mediaType) ? clip.muted === true : clip.hidden === true
            items.push({ action: "toggleClipEnabled", label: disabled ? "Enable" : "Disable",
                           icon: disabled ? Icons.visibility : Icons.visibilityOff })
        }
        if (clip.linkId) items.push({ action: "linkClips", label: "Unlink", icon: Icons.linkOff })
        return items
    }
    objectName: "registryContextMenu-clip"
    width: Math.max(180, implicitContentWidth + 2 * Theme.spacingXs)
    padding: Theme.spacingXs
    popupType: Popup.Item
    // Settle the dynamic ListView's hit regions before accepting clicks.
    onAboutToShow: contentItem.forceLayout()
    background: Rectangle { color: Theme.backgroundPaper; radius: Theme.radiusLg; border.color: Theme.divider }
    Instantiator {
        model: menu.webItems.concat(menu.registeredItems)
        delegate: MenuActionItem {
            required property var modelData
            objectName: (modelData.registered ? "registryMenu-clip-" : "clipMenu-") + modelData.action
            text: modelData.label
            enabled: modelData.enabled ?? true
            iconPath: modelData.icon ?? ""
            shortcutText: modelData.shortcut ?? ""
            actionName: modelData.action
            actionContext: menu.actionContext
            gestures: menu.gestures
        }
        onObjectAdded: (index, object) => menu.insertItem(index, object)
        onObjectRemoved: (index, object) => menu.removeItem(object)
    }
    MenuSeparator {
        objectName: "clipMenu-deleteDivider"
        contentItem: Rectangle { implicitHeight: 1; color: Theme.divider }
    }
    MenuActionItem {
        objectName: "clipMenu-deleteSelected"
        text: "Delete"
        iconPath: Icons.deleteOutline
        destructive: true
        actionName: "deleteSelected"
        actionContext: menu.actionContext
        gestures: menu.gestures
    }
}

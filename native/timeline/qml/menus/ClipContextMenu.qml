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
    readonly property var actionContext: Object.assign({}, context, { kind: "clip", clipIds: [context.clipId] })
    readonly property var registeredItems: MenuRegistry.query("clip", actionContext).map(
        item => Object.assign({}, item, { registered: true }))
    readonly property var webItems: {
        const clip = context.clip
        if (!clip) return []
        const items = [
            { action: "splitAtPlayhead", label: "Split at playhead", icon: "contentCut" },
            { action: "duplicate", label: "Duplicate", icon: "duplicate" }
        ]
        const transition = (clip.transitionIn?.durationMs ?? 0) > 0
        items.push({ action: transition ? "removeTransition" : "applyDefaultTransition",
                       label: transition ? "Remove transition" : "Cross-fade in",
                       icon: "crossFadeIn" })
        if (["audio", "video", "midi"].includes(clip.mediaType)) {
            const fades = ((clip.fadeInMs ?? 0) || (clip.fadeOutMs ?? 0)) > 0
            items.push({ action: fades ? "removeFades" : "applyFades",
                           label: fades ? "Remove fades" : "Fade in and out", icon: "graphicEq" })
        }
        items.push({ action: "toggleClipLock", label: clip.locked ? "Unlock" : "Lock",
                       icon: clip.locked ? "lock" : "lockOpen" })
        if (!clip.locked) {
            const disabled = ["audio", "midi"].includes(clip.mediaType) ? clip.muted === true : clip.hidden === true
            items.push({ action: "toggleClipEnabled", label: disabled ? "Enable" : "Disable",
                           icon: disabled ? "visibility" : "visibilityOff" })
        }
        if (clip.linkId) items.push({ action: "linkClips", label: "Unlink", icon: "linkOff" })
        return items
    }
    objectName: "registryContextMenu-clip"
    popupType: Popup.Item
    // Settle the dynamic ListView's hit regions before accepting clicks.
    onAboutToShow: contentItem.forceLayout()
    Instantiator {
        model: menu.webItems.concat(menu.registeredItems)
        delegate: MenuActionItem {
            required property var modelData
            objectName: (modelData.registered ? "registryMenu-clip-" : "clipMenu-") + modelData.action
            text: modelData.label
            enabled: modelData.enabled ?? true
            iconName: modelData.icon ?? ""
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
        contentItem: Ui.Separator {}
    }
    MenuActionItem {
        objectName: "clipMenu-deleteSelected"
        text: "Delete"
        iconName: "deleteOutline"
        destructive: true
        actionName: "deleteSelected"
        actionContext: menu.actionContext
        gestures: menu.gestures
    }
}

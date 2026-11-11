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
    readonly property var actionContext: Object.assign({}, context, { kind: "clip", clipIds: context.clipIds ?? [context.clipId], gestures: gestures })
    // Every clip delegate holds this menu. Build its items when a right click sets the context.
    readonly property var queried: context.clipId ? MenuRegistry.query("clip", actionContext) : []
    readonly property var registeredItems: queried.filter(item => !item.submenu && !topGroups.includes(item.group)).map(
        item => Object.assign({}, item, { registered: true }))
    readonly property var labelItems: queried.filter(item => item.submenu === "Label")
    // A submenu with no item that works on this clip is left out.
    readonly property var extraSubmenus: {
        const titles = [...new Set(queried.map(item => item.submenu))].filter(title => title && title !== "Label")
        return titles.map(title => ({ title, items: queried.filter(item => item.submenu === title) }))
            .filter(submenu => submenu.items.some(item => item.enabled))
    }
    function labelRow() {
        for (let index = 0; index < count; ++index) {
            if (itemAt(index).subMenu === labelMenu) return index
        }
        return count
    }
    // Registered items of these groups join the matching rows at the top of the menu.
    readonly property var topGroups: ["edit", "state"]
    function topItems(group) { return queried.filter(item => item.group === group && !item.submenu) }
    readonly property var webItems: {
        const clip = context.clip
        if (!clip) return []
        const locked = context.editable === false
        const unlock = locked ? "Unlock the clip first." : ""
        const playhead = context.playheadMs ?? 0
        const inside = playhead > clip.startMs && playhead < clip.startMs + clip.durationMs
        const items = [
            { action: "splitAtPlayhead", label: "Split at playhead", icon: "contentCut", group: "edit", enabled: inside,
              reason: inside ? "" : "Move the playhead over this clip first." },
            { action: "duplicate", label: "Duplicate", icon: "duplicate", group: "edit" },
            ...topItems("edit")
        ]
        const transition = (clip.transitionIn?.durationMs ?? 0) > 0
        items.push({ action: transition ? "removeTransition" : "applyDefaultTransition",
                       label: transition ? "Remove transition" : "Cross-fade in",
                       icon: "crossFadeIn", group: "transition", enabled: !locked, reason: unlock })
        if (["audio", "video", "midi"].includes(clip.mediaType)) {
            const fades = ((clip.fadeInMs ?? 0) || (clip.fadeOutMs ?? 0)) > 0
            items.push({ action: fades ? "removeFades" : "applyFades",
                           label: fades ? "Remove fades" : "Fade in and out", icon: "graphicEq",
                           group: "transition", enabled: !locked, reason: unlock })
        }
        items.push({ action: "toggleClipLock", label: clip.locked ? "Unlock" : "Lock",
                       icon: clip.locked ? "lock" : "lockOpen", group: "state" })
        if (!clip.locked) {
            const disabled = ["audio", "midi"].includes(clip.mediaType) ? clip.muted === true : clip.hidden === true
            items.push({ action: "toggleClipEnabled", label: disabled ? "Enable" : "Disable",
                           icon: disabled ? "visibility" : "visibilityOff", group: "state" })
        }
        if (clip.linkId) items.push({ action: "linkClips", label: "Unlink", icon: "linkOff", group: "state" })
        items.push(...topItems("state"))
        return items.map((item, index) => Object.assign(item, { separatorBefore: index > 0 && items[index - 1].group !== item.group }))
    }
    objectName: "registryContextMenu-clip"
    popupType: Popup.Item
    // The submenu's row in this menu takes its name here, for tests and for accessibility.
    delegate: Ui.MenuItem { objectName: subMenu ? "clipMenu-" + subMenu.objectName : "" }
    // Settle the dynamic ListView's hit regions before accepting clicks.
    onAboutToShow: contentItem.forceLayout()
    Component { id: groupSeparator; MenuSeparator { contentItem: Ui.Separator {} } }
    // The items whose labels follow the clip, from the top of the menu down to Label.
    Instantiator {
        property int separators: 0
        model: menu.webItems
        delegate: ClipMenuEntry { objectName: "clipMenu-" + modelData.action; host: menu }
        onObjectAdded: (index, object) => {
            if (object.modelData.separatorBefore) {
                object.separatorBefore = groupSeparator.createObject(menu.contentItem, { objectName: "registryMenuGroup-clip-" + object.modelData.group })
                menu.insertItem(index + separators++, object.separatorBefore)
            }
            menu.insertItem(index + separators, object)
        }
        onObjectRemoved: (index, object) => {
            if (object.separatorBefore) {
                menu.removeItem(object.separatorBefore)
                --separators
            }
            menu.removeItem(object)
        }
    }
    MenuSeparator {
        id: labelDivider
        objectName: "clipMenu-labelDivider"
        contentItem: Ui.Separator {}
    }
    component RegisteredSubmenu: Ui.ContextMenu {
        id: submenu
        required property var host
        required property var items
        required property string entryPrefix
        popupType: Popup.Item
        // A submenu places itself against its parent, so its parent is its row, not the overlay.
        onAboutToShow: {
            for (let index = 0; index < host.count; ++index) {
                const row = host.itemAt(index)
                if (row && row.subMenu === submenu) parent = row
            }
        }
        Instantiator {
            model: submenu.items
            delegate: ClipMenuEntry { objectName: submenu.entryPrefix + modelData.action; host: submenu.host }
            onObjectAdded: (index, object) => submenu.insertItem(index, object)
            onObjectRemoved: (index, object) => submenu.removeItem(object)
        }
    }
    RegisteredSubmenu { id: labelMenu; objectName: "label"; title: "Label"; host: menu; items: menu.labelItems; entryPrefix: "clipLabelMenu-" }
    Instantiator {
        model: menu.extraSubmenus
        delegate: RegisteredSubmenu {
            required property var modelData
            objectName: modelData.title
            title: modelData.title
            host: menu
            items: modelData.items
            entryPrefix: "clipSubmenu-"
        }
        onObjectAdded: (index, object) => menu.insertMenu(menu.labelRow() + 1 + index, object)
        onObjectRemoved: (index, object) => menu.removeMenu(object)
    }
    MenuSeparator {
        objectName: "clipMenu-afterLabelDivider"
        contentItem: Ui.Separator {}
    }
    // The registered items, in their groups, down to Delete.
    Instantiator {
        function deleteRow() {
            for (let index = 0; index < menu.count; ++index) {
                if (menu.itemAt(index) === deleteDivider) return index
            }
            return menu.count
        }
        model: menu.registeredItems
        delegate: ClipMenuEntry { objectName: "registryMenu-clip-" + modelData.action; host: menu }
        onObjectAdded: (index, object) => {
            if (object.modelData.separatorBefore) {
                object.separatorBefore = groupSeparator.createObject(menu.contentItem, { objectName: "registryMenuGroup-clip-" + object.modelData.group })
                menu.insertItem(deleteRow(), object.separatorBefore)
            }
            menu.insertItem(deleteRow(), object)
        }
        onObjectRemoved: (index, object) => {
            if (object.separatorBefore) menu.removeItem(object.separatorBefore)
            menu.removeItem(object)
        }
    }
    MenuSeparator {
        id: deleteDivider
        objectName: "clipMenu-deleteDivider"
        contentItem: Ui.Separator {}
    }
    MenuActionItem {
        objectName: "clipMenu-rippleDeleteSelected"
        text: "Ripple delete"
        iconName: "deleteOutline"
        destructive: true
        actionName: "rippleDeleteSelected"
        actionContext: menu.actionContext
        gestures: menu.gestures
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

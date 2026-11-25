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
    Ui.MenuItem {
        objectName: "clipMenu-joinClips"
        visible: menu.gestures.keymapContext === "music"
        height: visible ? implicitHeight : 0
        text: qsTr("Join clips")
        enabled: menu.context.editable !== false && menu.gestures.selection.length >= 2
        reasonText: qsTr("Select at least two clips on one track.")
        onTriggered: menu.gestures.timeline.applyEdit("join_clips", { clips: menu.gestures.selection })
    }
    // Loop repeats the clip's current length four times. Remove loop takes the repeats off. One undo each.
    Ui.MenuItem {
        objectName: "clipMenu-loopClip"
        readonly property var clip: menu.context.clip || ({})
        visible: menu.gestures.keymapContext === "music" && ["audio", "midi"].includes(clip.mediaType) && !clip.timeRemap
        height: visible ? implicitHeight : 0
        readonly property bool looped: (clip.loopLengthMs ?? 0) > 0 && clip.loopLengthMs < (clip.durationMs ?? 0)
        text: looped ? qsTr("Remove loop") : qsTr("Loop")
        enabled: menu.context.editable !== false
        reasonText: enabled ? "" : qsTr("Unlock the clip first.")
        onTriggered: {
            const params = looped ? { clipId: menu.context.clipId, loopLengthMs: null }
                                   : { clipId: menu.context.clipId, times: 4 }
            menu.gestures.timeline.applyEdit("loop_clip", params)
        }
    }
    Ui.MenuItem {
        objectName: "clipMenu-repeatClip"
        visible: menu.gestures.keymapContext === "music"
        height: visible ? implicitHeight : 0
        text: qsTr("Repeat…")
        onTriggered: {
            repeatDialog.clipId = menu.context.clipId || ""
            repeatCount.value = 1
            repeatCount.text = "1"
            repeatDialog.open()
        }
    }
    Ui.Dialog {
        id: repeatDialog
        property string clipId: ""
        title: qsTr("Repeat clip")
        width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width - Ui.Metrics.dialogNarrowInset * 2 : Ui.Metrics.dialogCompactWidth)
        returnFocusTo: menu.gestures
        onOpened: { repeatCount.forceActiveFocus(); repeatCount.selectAll() }
        function applyCopies() {
            const count = Number(repeatCount.text)
            if (!Number.isInteger(count) || count < 1 || count > 64) return
            if (menu.gestures.timeline.applyEdit("duplicate_clip", { clipId: clipId, count: count })) close()
        }
        contentItem: Column {
            spacing: Ui.Metrics.md
            Ui.Text { text: qsTr("Additional copies, placed back to back"); role: Ui.Typography.SansLabel }
            Ui.NumberField {
                id: repeatCount
                objectName: "musicRepeatCount"
                width: parent.width
                value: 1
                from: 1
                to: 64
                stepSize: 1
                accessibleName: qsTr("Additional copies")
                valid: Number.isInteger(Number(text))
                errorText: qsTr("Enter a whole number from 1 to 64.")
                onAccepted: repeatDialog.applyCopies()
            }
        }
        footer: Item {
            implicitHeight: repeatApply.implicitHeight + repeatDialog.padding * 2
            Row {
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.margins: repeatDialog.padding
                spacing: Ui.Metrics.sm
                Ui.EditorButton { text: qsTr("Cancel"); onClicked: repeatDialog.close() }
                Ui.EditorButton {
                    id: repeatApply
                    objectName: "musicRepeatApply"
                    text: qsTr("Repeat")
                    variant: Ui.EditorButton.Primary
                    enabled: repeatCount.draftValid && Number.isInteger(Number(repeatCount.text))
                    onClicked: repeatDialog.applyCopies()
                }
            }
        }
    }
    Ui.MenuItem {
        objectName: "clipMenu-renameClip"
        text: qsTr("Rename…")
        enabled: menu.context.editable !== false
        reasonText: qsTr("Unlock the clip first.")
        onTriggered: {
            renameDialog.clipId = menu.context.clipId || ""
            renameDialog.originalName = menu.context.clip?.name || ""
            renameField.value = renameDialog.originalName
            renameField.text = renameDialog.originalName
            renameDialog.open()
        }
    }
    Ui.Dialog {
        id: renameDialog
        property string clipId: ""
        property string originalName: ""
        title: qsTr("Rename clip")
        width: Math.min(Ui.Metrics.dialogCompactWidth, parent ? parent.width - Ui.Metrics.dialogNarrowInset * 2 : Ui.Metrics.dialogCompactWidth)
        returnFocusTo: menu.gestures
        onOpened: { renameField.forceActiveFocus(); renameField.selectAll() }
        function applyName() {
            if (renameField.text === originalName || menu.gestures.timeline.applyEdit("set_clip_params", {clipId: clipId, name: renameField.text})) close()
        }
        contentItem: Ui.TextField {
            id: renameField
            objectName: "clipRenameField"
            accessibleName: qsTr("Clip name")
            onAccepted: renameDialog.applyName()
        }
        footer: Item {
            implicitHeight: renameApply.implicitHeight + renameDialog.padding * 2
            Row {
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                anchors.margins: renameDialog.padding
                spacing: Ui.Metrics.sm
                Ui.EditorButton { text: qsTr("Cancel"); onClicked: renameDialog.close() }
                Ui.EditorButton {
                    id: renameApply
                    objectName: "clipRenameApply"
                    text: qsTr("Rename")
                    variant: Ui.EditorButton.Primary
                    onClicked: renameDialog.applyName()
                }
            }
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
        destructive: true
        actionName: "rippleDeleteSelected"
        actionContext: menu.actionContext
        gestures: menu.gestures
    }
    MenuActionItem {
        objectName: "clipMenu-deleteSelected"
        text: "Delete"
        destructive: true
        actionName: "deleteSelected"
        actionContext: menu.actionContext
        gestures: menu.gestures
    }
}

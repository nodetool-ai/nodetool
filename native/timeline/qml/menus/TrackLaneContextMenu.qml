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
    readonly property var actionContext: Object.assign({}, context, { kind: "lane", gestures: gestures })
    readonly property var webItems: {
        const items = []
        if (["overlay", "video"].includes(context.trackType)) items.push({ action: "addText", label: "Add text", icon: "title" })
        if (hasGap) {
            const gap = MenuRegistry.query("gap", actionContext).map(item => Object.assign({}, item, { registered: "gap" }))
            return items.concat(gap)
        }
        return items
    }
    function openAt(area, px, py) {
        // A right-click on a gap selects it, as a click does, so the gap's items work on it.
        hasGap = gestures.selectGapAt(context.trackId, context.timeMs)
        // Let the Instantiator settle the menu's size before placing the popup.
        Qt.callLater(() => { if (count > 0) popupAt(area, px, py) })
    }
    objectName: "registryContextMenu-lane"
    popupType: Popup.Item
    Component { id: groupSeparator; MenuSeparator { contentItem: Ui.Separator {} } }
    Instantiator {
        property int separators: 0
        model: menu.webItems
        delegate: MenuActionItem {
            required property var modelData
            property Item separatorBefore: null
            objectName: (modelData.registered ? "registryMenu-" + modelData.registered + "-" : "laneMenu-") + modelData.action
            text: modelData.label
            iconName: modelData.icon ?? ""
            enabled: modelData.enabled ?? true
            reasonText: modelData.reason ?? ""
            actionName: modelData.action
            actionContext: menu.actionContext
            gestures: menu.gestures
        }
        onObjectAdded: (index, object) => {
            if (object.modelData.registered && index > 0) {
                object.separatorBefore = groupSeparator.createObject(menu.contentItem)
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
    RegistryMenuItems { menu: menu; kind: "lane"; context: menu.actionContext; gestures: menu.gestures }
}

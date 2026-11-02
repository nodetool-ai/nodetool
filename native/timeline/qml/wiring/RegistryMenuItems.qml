pragma ComponentBehavior: Bound
import QtQuick
import QtQml
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Instantiator {
    id: entries
    required property var menu
    required property string kind
    required property var context
    required property ClipGestureController gestures
    readonly property var actionContext: Object.assign({}, context, { kind: kind })
    readonly property Component groupSeparator: Component { MenuSeparator { contentItem: Ui.Separator {} } }
    model: MenuRegistry.query(kind, actionContext)
    delegate: Ui.MenuItem {
        id: entry
        required property var modelData
        property Item separatorBefore: null
        objectName: "registryMenu-" + entries.kind + "-" + modelData.action
        text: modelData.label
        enabled: modelData.enabled
        checkable: modelData.checkable
        checked: modelData.checked
        shortcutText: modelData.shortcut ?? ""
        onTriggered: if (entries.gestures) entries.gestures.runAction(modelData.action, entries.actionContext)
    }
    onObjectAdded: (index, object) => {
        if (object.modelData.separatorBefore) {
            object.separatorBefore = groupSeparator.createObject(menu.contentItem, { objectName: "registryMenuGroup-" + kind + "-" + object.modelData.group })
            menu.addItem(object.separatorBefore)
        }
        menu.addItem(object)
    }
    onObjectRemoved: (index, object) => {
        if (object.separatorBefore) menu.removeItem(object.separatorBefore)
        menu.removeItem(object)
    }
}

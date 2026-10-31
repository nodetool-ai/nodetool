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
    model: MenuRegistry.query(kind, actionContext)
    delegate: Ui.MenuItem {
        id: entry
        required property var modelData
        objectName: "registryMenu-" + entries.kind + "-" + modelData.action
        text: modelData.label
        enabled: modelData.enabled
        shortcutText: modelData.shortcut ?? ""
        onTriggered: if (entries.gestures) entries.gestures.runAction(modelData.action, entries.actionContext)
    }
    onObjectAdded: (index, object) => menu.addItem(object)
    onObjectRemoved: (index, object) => menu.removeItem(object)
}

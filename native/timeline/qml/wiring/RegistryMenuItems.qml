pragma ComponentBehavior: Bound
import QtQuick
import QtQml
import QtQuick.Controls as Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Instantiator {
    id: entries
    required property Ui.ContextMenu menu
    required property string kind
    // Dynamic action context crosses the registry API and can include QObject references.
    required property var context
    required property ClipGestureController gestures
    // Dynamic action context crosses the registry API and can include QObject references.
    readonly property var actionContext: Object.assign({}, context, { kind: kind, gestures: gestures })
    readonly property Component groupSeparator: Component { Controls.MenuSeparator { contentItem: Ui.Separator {} } }
    property int stateRevision: 0
    model: {
        if (!active) return []
        const revision = stateRevision
        return MenuRegistry.query(kind, actionContext)
    }
    readonly property Connections gestureState: Connections {
        target: entries.active ? entries.gestures : null
        function onSelectionChanged() { ++entries.stateRevision }
        function onOptionsChanged() { ++entries.stateRevision }
        function onGestureChanged() { ++entries.stateRevision }
    }
    readonly property Connections documentState: Connections {
        target: entries.active && entries.gestures ? entries.gestures.timeline : null
        function onTimelineChanged() { ++entries.stateRevision }
        function onReadOnlyChanged() { ++entries.stateRevision }
    }
    active: false
    readonly property Connections lifecycle: Connections {
        target: entries.menu
        function onAboutToShow() {
            entries.active = true
        }
        function onAboutToHide() { entries.active = false }
        function onClosed() { entries.active = false }
    }
    delegate: Ui.MenuItem {
        id: entry
        // JSON record supplied by the delegate model.
        required property var modelData
        property Item separatorBefore: null
        objectName: "registryMenu-" + entries.kind + "-" + modelData.action
        text: modelData.label
        enabled: modelData.enabled
        checkable: modelData.checkable
        checked: modelData.checked
        shortcutText: (entries.gestures && entries.gestures.keyboardPreset !== "" ? entries.gestures.shortcutFor(modelData.action) : "") || (modelData.shortcut ?? "")
        reasonText: modelData.reason ?? ""
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

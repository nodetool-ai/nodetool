pragma ComponentBehavior: Bound
import QtQuick
import QtQml
import QtQuick.Controls
import NodeTool.Timeline

Instantiator {
    id: entries
    required property var menu
    required property string kind
    required property var context
    required property ClipGestureController gestures
    readonly property var actionContext: Object.assign({}, context, { kind: kind })
    model: MenuRegistry.query(kind, actionContext)
    delegate: MenuItem {
        id: entry
        required property var modelData
        objectName: "registryMenu-" + entries.kind + "-" + modelData.action
        text: modelData.label
        enabled: modelData.enabled
        height: Theme.rulerHeight
        leftPadding: Theme.spacingMd
        rightPadding: Theme.spacingMd
        contentItem: Row {
            spacing: Theme.spacingLg
            Text {
                text: entry.text
                color: entry.enabled ? Theme.textPrimary : Theme.textDisabled
                font.family: Theme.sansFamily
                font.pixelSize: Theme.fontSizeSmall
            }
            Text {
                text: entry.modelData.shortcut
                color: Theme.textSecondary
                font.family: Theme.monoFamily
                font.pixelSize: Theme.fontSizeSmaller
            }
        }
        background: Rectangle { color: entry.highlighted ? Theme.actionHover : "transparent"; radius: Theme.radiusSm }
        onTriggered: if (entries.gestures) entries.gestures.runAction(modelData.action, entries.actionContext)
    }
    onObjectAdded: (index, object) => menu.addItem(object)
    onObjectRemoved: (index, object) => menu.removeItem(object)
}

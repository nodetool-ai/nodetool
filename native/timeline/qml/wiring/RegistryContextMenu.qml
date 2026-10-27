import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

Menu {
    id: menu
    required property string kind
    required property ClipGestureController gestures
    property var context: ({})
    objectName: "registryContextMenu-" + kind
    width: Math.max(220, implicitContentWidth + 2 * Theme.spacingXs)
    padding: Theme.spacingXs
    popupType: Popup.Item
    background: Rectangle { color: Theme.backgroundPaper; radius: Theme.radiusLg; border.color: Theme.divider }
    RegistryMenuItems {
        menu: menu
        kind: menu.kind
        context: menu.context
        gestures: menu.gestures
    }
}

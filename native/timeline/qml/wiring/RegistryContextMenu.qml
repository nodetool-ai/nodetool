import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.ContextMenu {
    id: menu
    required property string kind
    required property ClipGestureController gestures
    property var context: ({})
    objectName: "registryContextMenu-" + kind
    popupType: Popup.Item
    RegistryMenuItems {
        menu: menu
        kind: menu.kind
        context: menu.context
        gestures: menu.gestures
    }
}

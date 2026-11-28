pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.ContextMenu {
    id: menu
    required property string kind
    required property ClipGestureController gestures
    // Dynamic action context crosses the registry API and can include QObject references.
    property var context: ({})
    objectName: "registryContextMenu-" + kind
    popupType: Popup.Item
    Connections {
        target: menu
        function onClosed() { menu.context = ({}) }
    }
    RegistryMenuItems {
        menu: menu
        kind: menu.kind
        context: menu.context
        gestures: menu.gestures
    }
}

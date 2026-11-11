import QtQuick
import NodeTool.UiPrimitives as Ui

Ui.MenuButton {
    id: root
    property var options: []
    property var value
    property alias popup: choices
    signal valueCommitted(var value)
    text: {
        const option = options.find(option => option.value === value)
        return option ? option.label : ""
    }
    circular: true
    variant: Ui.EditorButton.Flat
    trailingIconName: ""
    menu: choices
    Ui.ContextMenu {
        id: choices
        Instantiator {
            model: root.options
            delegate: Ui.MenuItem {
                required property var modelData
                required property int index
                objectName: "chip-option-" + index
                text: modelData.label
                shortcutText: modelData.shortcutText !== undefined ? String(modelData.shortcutText) : ""
                iconName: root.iconName
                checkable: true
                checked: modelData.value === root.value
                enabled: root.enabled && modelData.enabled !== false
                onTriggered: root.valueCommitted(modelData.value)
            }
            onObjectAdded: (index, object) => choices.insertItem(index, object)
            onObjectRemoved: (index, object) => choices.removeItem(object)
        }
    }
}

import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.ContextMenu {
    id: menu
    objectName: "clipTransformContextMenu"
    signal action(string name)
    modal: true
    focus: true
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

    component TransformMenuItem: Ui.MenuItem {
        required property string actionName
        objectName: "gizmoAction_" + actionName
        onTriggered: { menu.action(actionName); menu.close() }
    }
    component TransformSeparator: MenuSeparator {
        contentItem: Ui.Separator {}
    }
    Ui.Text {
        text: qsTr("Transform")
        height: Ui.Metrics.comfortable
        x: Ui.Metrics.lg
        verticalAlignment: Text.AlignVCenter
        role: Ui.Typography.SansCaption
        tone: Ui.Text.Secondary
    }
    TransformMenuItem {
        actionName: "reset"
        text: qsTr("Reset")
        iconName: "reset"
        shortcutText: "."
    }
    TransformSeparator {}
    TransformMenuItem {
        actionName: "rotate180"
        text: qsTr("Rotate 180°")
        iconName: "rotateRight"
    }
    TransformMenuItem {
        actionName: "rotate90CW"
        text: qsTr("Rotate 90° CW")
        iconName: "rotateClockwise"
    }
    TransformMenuItem {
        actionName: "rotate90CCW"
        text: qsTr("Rotate 90° CCW")
        iconName: "rotateCounterclockwise"
    }
    TransformSeparator {}
    TransformMenuItem {
        actionName: "flipHorizontal"
        text: qsTr("Flip horizontal")
        iconName: "flipHorizontal"
    }
    TransformMenuItem {
        actionName: "flipVertical"
        text: qsTr("Flip vertical")
        iconName: "flipVertical"
    }
}

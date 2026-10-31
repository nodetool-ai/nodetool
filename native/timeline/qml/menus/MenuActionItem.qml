pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.MenuItem {
    id: entry
    required property ClipGestureController gestures
    required property string actionName
    required property var actionContext
    property bool destructive: false
    iconTone: destructive ? Ui.Text.Error : Ui.Text.Secondary
    textTone: destructive ? Ui.Text.Error : Ui.Text.Primary
    onTriggered: if (gestures) gestures.runAction(actionName, actionContext)
}

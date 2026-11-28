pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

// One row the clip menu builds from its model.
MenuActionItem {
    required property var modelData
    required property var host
    property Item separatorBefore: null
    text: modelData.label
    enabled: modelData.enabled ?? true
    checkable: modelData.checkable ?? false
    checked: modelData.checked ?? false
    // The clip menu is a text menu, as in a DAW, so every label starts at one edge.
    iconName: ""
    reasonText: modelData.reason ?? ""
    actionName: modelData.action
    actionContext: host.actionContext
    gestures: host.gestures
}

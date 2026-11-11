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
    iconName: modelData.icon ?? ""
    reasonText: modelData.reason ?? ""
    actionName: modelData.action
    actionContext: host.actionContext
    gestures: host.gestures
}

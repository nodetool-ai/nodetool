import QtQuick
import QtQuick.Controls
import NodeTool.Timeline
InspectorRow {
    id: root
    property bool checked: false
    property bool disabled: false
    signal change(bool next)
    Switch {
        checked: root.checked
        enabled: !root.disabled
        id: control
        implicitWidth: Theme.controlXs + Theme.spacingXl
        implicitHeight: Theme.controlXs
        padding: 0
        indicator: Item {
            implicitWidth: control.implicitWidth
            implicitHeight: control.implicitHeight
            opacity: control.enabled ? 1 : 0.5
            Rectangle {
                x: Theme.spacingSm + 1
                y: (parent.height - height) / 2
                width: parent.width - x * 2
                height: Theme.spacingMd + Theme.spacingMicro
                radius: height / 2
                color: control.checked ? Theme.primary : Theme.overlayStrong
            }
            Rectangle {
                x: control.checked ? parent.width - width - Theme.spacingXs : Theme.spacingXs
                y: (parent.height - height) / 2
                width: Theme.iconSm
                height: width
                radius: width / 2
                color: control.checked ? Theme.primary : Theme.textPrimary
            }
        }
        Accessible.name: root.label
        onClicked: root.change(checked)
    }
}

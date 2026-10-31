import QtQuick
import QtQuick.Controls.Basic as Controls
import QtQuick.Layouts
import NodeTool.Timeline
Item {
    id: root
    property string title: ""
    property string icon: ""
    property string meta: ""
    property bool checkable: false
    property bool checked: true
    property bool checkboxDisabled: false
    property var action: null
    signal checkedChangedByUser(bool next)
    signal actionTriggered()
    implicitHeight: Theme.controlXs
    RowLayout {
        anchors.fill: parent
        spacing: Theme.spacingSm
        Controls.CheckBox {
            visible: root.checkable
            enabled: !root.checkboxDisabled
            checked: root.checked
            implicitWidth: Theme.controlXs
            implicitHeight: Theme.controlXs
            id: activation
            padding: 0
            indicator: Rectangle {
                x: (activation.width - width) / 2
                y: (activation.height - height) / 2
                width: Theme.fontSizeSmall
                height: width
                radius: Theme.radiusXs
                color: activation.checked ? Theme.primary : "transparent"
                border.width: 1
                border.color: activation.checked ? Theme.primary : Theme.overlayStrong
                Icon { anchors.centerIn: parent; visible: activation.checked; path: Icons.check; color: Theme.textPrimary; size: Theme.fontSizeSmaller }
            }
            Accessible.name: root.title + " enabled"
            onClicked: root.checkedChangedByUser(checked)
        }
        Icon { visible: !!root.icon; path: root.icon; color: Theme.textSecondary; size: Theme.iconSm }
        Text {
            Layout.fillWidth: true
            text: root.title.toUpperCase()
            elide: Text.ElideRight
            color: root.checkable && !root.checked ? Theme.textDisabled : Theme.textSecondary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
            font.weight: Font.Medium
            font.letterSpacing: Theme.fontSizeSmaller * 0.06
        }
        Text { text: root.meta; color: Theme.textSecondary; font.family: Theme.monoFamily; font.pixelSize: Theme.fontSizeSmaller }
        PanelButton {
            visible: !!root.action
            enabled: visible && !root.action.disabled
            text: root.action ? root.action.label : ""
            iconPath: root.action ? root.action.icon || "" : ""
            iconOnly: true
            implicitWidth: Theme.controlXs
            implicitHeight: Theme.controlXs
            onClicked: {
                root.actionTriggered()
                if (root.action.onClick) root.action.onClick()
            }
        }
    }
}

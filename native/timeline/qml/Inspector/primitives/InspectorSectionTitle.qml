import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

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
    implicitHeight: Ui.Metrics.compact

    RowLayout {
        anchors.fill: parent
        spacing: Ui.Metrics.sm
        Item {
            visible: root.checkable
            Layout.alignment: Qt.AlignVCenter
            implicitWidth: checkbox.implicitWidth
            implicitHeight: checkbox.implicitHeight
            Ui.CheckBox {
                id: checkbox
                anchors.fill: parent
                enabled: !root.checkboxDisabled
                checked: root.checked
                accessibleName: root.title + " enabled"
                onCheckedChangedByUser: next => root.checkedChangedByUser(next)
            }
            MouseArea { anchors.fill: parent; enabled: root.checkboxDisabled; onPressed: event => event.accepted = true }
        }
        Ui.Icon {
            visible: root.icon !== ""
            Layout.alignment: Qt.AlignVCenter
            name: root.icon
            size: Ui.Metrics.iconXs
            tone: root.checkable && !root.checked ? Ui.Text.Disabled : Ui.Text.Secondary
        }
        Ui.Text {
            Layout.fillWidth: true
            text: root.title.toUpperCase()
            elide: Text.ElideRight
            tone: root.checkable && !root.checked ? Ui.Text.Disabled : Ui.Text.Secondary
            role: Ui.Typography.SansCaption
        }
        Ui.Text { text: root.meta; tone: Ui.Text.Secondary; role: Ui.Typography.MonoCaption }
        Item {
            visible: !!root.action
            implicitWidth: actionButton.implicitWidth
            implicitHeight: actionButton.implicitHeight
            Ui.ToolbarIconButton {
                id: actionButton
                anchors.fill: parent
                enabled: !!root.action && !root.action.disabled
                iconName: root.action ? root.action.icon || "" : ""
                accessibleName: root.action ? root.action.label : ""
                description: accessibleName
                onClicked: {
                    root.actionTriggered()
                    if (root.action.onClick) root.action.onClick()
                }
            }
            MouseArea { anchors.fill: parent; enabled: !actionButton.enabled; onPressed: event => event.accepted = true }
        }
    }
}

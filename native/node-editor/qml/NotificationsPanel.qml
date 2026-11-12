pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The notification list under the tab bar bell (web/src/components/panels/NotificationButton.tsx):
// each entry has a colored left edge for its type, the text, the time and a copy action.
Rectangle {
    id: root
    EditorRoles { id: roles }
    required property Notifications notifications
    readonly property var entries: root.notifications.entries
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
    readonly property real pad: Ui.Metrics.lg
    implicitWidth: Ui.Metrics.dialogWidth
    implicitHeight: Math.min(Ui.Metrics.dialogWidth, pad * 2 + header.implicitHeight + Ui.Metrics.md
                             + (entries.length === 0 ? empty.implicitHeight : list.contentHeight))
    Accessible.role: Accessible.Pane
    Accessible.name: qsTr("Notifications")
    function edgeColor(type) {
        return type === "error" ? Ui.Theme.statusError
            : type === "warning" ? Ui.Theme.statusWarning
            : type === "success" ? Ui.Theme.statusSuccess
            : type === "info" ? Ui.Theme.statusInfo : Ui.Theme.textDisabled
    }
    Keys.onEscapePressed: Window.window.close()
    Ui.Text {
        id: header
        objectName: "notifications-header"
        x: root.pad
        y: root.pad
        text: qsTr("Notifications")
        role: Ui.Typography.SansLabel
        Accessible.ignored: true
    }
    Ui.EmptyState {
        id: empty
        objectName: "notifications-empty"
        anchors.horizontalCenter: parent.horizontalCenter
        y: list.y
        width: parent.width - root.pad * 2
        maxTextWidth: width
        visible: root.entries.length === 0
        title: qsTr("No notifications")
    }
    ListView {
        id: list
        objectName: "notifications-list"
        x: root.pad
        y: root.pad + header.implicitHeight + Ui.Metrics.md
        width: parent.width - root.pad * 2
        height: parent.height - y - root.pad
        visible: root.entries.length > 0
        clip: true
        spacing: Ui.Metrics.lg
        boundsBehavior: Flickable.StopAtBounds
        model: root.entries
        Accessible.role: Accessible.List
        Accessible.name: root.entries.length === 1 ? qsTr("Notification list, 1 item") : qsTr("Notification list, %1 items").arg(root.entries.length)
        Basic.ScrollBar.vertical: Ui.ScrollBar {}
        delegate: Rectangle {
            id: entry
            required property var modelData
            width: ListView.view.width
            implicitHeight: content.implicitHeight + Ui.Metrics.xl * 2
            height: implicitHeight
            radius: Ui.Metrics.radiusControl
            color: root.edgeColor(modelData.type)
            Accessible.role: Accessible.ListItem
            Accessible.name: modelData.type + " notification: " + modelData.content
            // The type edge follows the row radius: the panel fill covers all but the left stripe.
            Rectangle {
                x: Ui.Metrics.focus + Ui.Metrics.border
                width: parent.width - x
                height: parent.height
                radius: entry.radius
                color: roles.panel
            }
            Rectangle {
                x: Ui.Metrics.focus + Ui.Metrics.border
                width: entry.radius
                height: parent.height
                color: roles.panel
            }
            ColumnLayout {
                id: content
                anchors.left: parent.left
                anchors.right: copy.left
                anchors.top: parent.top
                anchors.margins: Ui.Metrics.xl
                spacing: Ui.Metrics.xs
                Ui.Text {
                    Layout.fillWidth: true
                    text: entry.modelData.content
                    textFormat: Text.PlainText
                    role: Ui.Typography.SansBody
                    wrapMode: Text.Wrap
                }
                Ui.Text {
                    text: Qt.formatDateTime(entry.modelData.timestamp, Qt.DefaultLocaleShortDate)
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
            }
            Ui.EditorButton {
                id: copy
                anchors.right: parent.right
                anchors.top: parent.top
                anchors.margins: Ui.Metrics.xs
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                iconName: "copy"
                iconSize: Ui.Metrics.iconXs
                accessibleName: qsTr("Copy notification")
                onClicked: root.notifications.copy(entry.modelData.content)
            }
        }
    }
}

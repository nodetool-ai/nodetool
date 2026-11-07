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
    readonly property var entries: editor ? editor.notifications : []
    color: Ui.Theme.surfaceOverlay
    border.color: Ui.Theme.borderControl
    border.width: Ui.Metrics.border
    radius: Ui.Metrics.radiusOverlay
    implicitWidth: 600
    implicitHeight: Math.min(600, (entries.length === 0 ? empty.implicitHeight : list.contentHeight) + Ui.Metrics.xxl * 2)
    Accessible.role: Accessible.Pane
    Accessible.name: qsTr("Notifications")
    function edgeColor(type) {
        return type === "error" ? Ui.Theme.statusError
            : type === "warning" ? Ui.Theme.statusWarning
            : type === "success" ? Ui.Theme.statusSuccess
            : type === "info" ? Ui.Theme.statusInfo : Ui.Theme.textDisabled
    }
    Keys.onEscapePressed: Window.window.close()
    Ui.EmptyState {
        id: empty
        objectName: "notifications-empty"
        anchors.centerIn: parent
        width: parent.width - Ui.Metrics.xxl * 2
        maxTextWidth: width
        visible: root.entries.length === 0
        title: qsTr("No notifications")
    }
    ListView {
        id: list
        objectName: "notifications-list"
        anchors.fill: parent
        anchors.margins: Ui.Metrics.xxl
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
            color: hover.hovered ? Ui.Theme.actionHover : roles.panel
            Accessible.role: Accessible.ListItem
            Accessible.name: modelData.type + " notification: " + modelData.content
            HoverHandler { id: hover }
            Rectangle { width: Ui.Metrics.focus + Ui.Metrics.border; height: parent.height; color: root.edgeColor(entry.modelData.type) }
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
                onClicked: editor.copyText(entry.modelData.content)
            }
        }
    }
}

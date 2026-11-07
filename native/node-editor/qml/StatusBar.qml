import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web editor's bottom bar: connection, panel toggles, and graph counts.
Rectangle {
    id: root
    EditorRoles { id: roles }
    color: roles.chrome
    implicitHeight: roles.statusHeight
    Rectangle { width: parent.width; height: Ui.Metrics.border; color: roles.divider }
    readonly property bool connected: editor && editor.connectionState === "Connected"
    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Ui.Metrics.xl
        anchors.rightMargin: Ui.Metrics.xl
        spacing: Ui.Metrics.md
        Rectangle { width: Ui.Metrics.sm; height: width; radius: width / 2; color: root.connected ? Ui.Theme.statusSuccess : Ui.Theme.textDisabled }
        Ui.Text { text: editor ? editor.connectionState.toLowerCase() : ""; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary; font.weight: Font.Normal; lineHeight: 1 }
        NodeButton { objectName: "status-reconnect"; text: "Connect"; variant: NodeButton.Flat; implicitHeight: Ui.Metrics.small; onClicked: editor.action("Connect") }
        NodeButton { objectName: "status-output"; text: "Output"; iconName: ""; variant: NodeButton.Flat; implicitHeight: Ui.Metrics.small; onClicked: editor.action("Output") }
        NodeButton { objectName: "status-server-sync"; visible: editor && editor.serverSyncAvailable; text: editor ? editor.serverSaveState : ""; variant: editor && editor.serverSyncNeedsAttention ? NodeButton.Outlined : NodeButton.Flat; implicitHeight: Ui.Metrics.small; onClicked: editor.action("Server sync") }
        Ui.Text {
            objectName: "status-message"
            Layout.fillWidth: true
            text: editor ? editor.message : ""
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            elide: Text.ElideRight
            lineHeight: 1
        }
        Ui.Text { objectName: "status-counts"; text: editor ? editor.graphSummary : ""; role: Ui.Typography.SansLabel; tone: Ui.Text.Secondary; font.weight: Font.Normal; lineHeight: 1 }
    }
}

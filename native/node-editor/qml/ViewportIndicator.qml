import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web ViewportStatusIndicator, floating at the canvas corner.
Item {
    EditorRoles { id: roles }
    implicitWidth: frame.implicitWidth
    implicitHeight: frame.implicitHeight
    Rectangle {
        id: frame
        objectName: "viewport-frame"
        anchors.fill: parent
        color: roles.paper
        radius: Ui.Metrics.radiusCard
        border.width: Ui.Metrics.border
        border.color: roles.divider
        implicitWidth: row.implicitWidth + Ui.Metrics.md * 2
        implicitHeight: row.implicitHeight + Ui.Metrics.xs * 2
        RowLayout {
            id: row
            anchors.centerIn: parent
            spacing: Ui.Metrics.micro
            NodeButton { objectName: "zoom-out"; text: ""; accessibleName: "Zoom out"; iconName: "remove"; variant: NodeButton.Flat; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: editor.action("Zoom out") }
            PanelRow {
                objectName: "zoom-reset"
                accessibleName: "Reset zoom"
                Layout.preferredWidth: 48
                Layout.preferredHeight: Ui.Metrics.small
                onClicked: editor.action("Reset zoom")
                Ui.Text {
                    anchors.fill: parent
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                    text: (editor ? editor.zoomPercent : 100) + "%"
                    role: Ui.Typography.MonoLabel
                    domainColor: editor && editor.zoomPercent === 100 ? Ui.Theme.accentPrimary : Ui.Theme.textSecondary
                    lineHeight: 1
                }
            }
            NodeButton { objectName: "zoom-in"; text: ""; accessibleName: "Zoom in"; iconName: "add"; variant: NodeButton.Flat; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: editor.action("Zoom in") }
            Rectangle { width: Ui.Metrics.border; height: Ui.Metrics.iconSm; color: roles.divider }
            NodeButton { objectName: "fit-view"; text: ""; accessibleName: "Fit view"; iconName: "fitScreen"; variant: NodeButton.Flat; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: editor.action("Fit") }
        }
    }
}

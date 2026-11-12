import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

// The web ViewportStatusIndicator, floating at the canvas corner.
Item {
    id: root
    required property Viewport viewport
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
            NodeButton { objectName: "zoom-out"; text: ""; accessibleName: "Zoom out"; iconName: "remove"; variant: NodeButton.Flat; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: root.viewport.run("Zoom out") }
            PanelRow {
                objectName: "zoom-reset"
                accessibleName: "Zoom presets"
                Layout.preferredWidth: Ui.Metrics.xl * 3
                Layout.preferredHeight: Ui.Metrics.small
                onClicked: root.viewport.run("Zoom presets")
                Ui.Text {
                    objectName: "zoom-label"
                    anchors.fill: parent
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                    text: root.viewport.zoomPercent + "%"
                    role: Ui.Typography.MonoLabel
                    // ViewportStatusIndicator.tsx colors the readout whenever the zoom is one of its presets.
                    domainColor: root.viewport.zoomIsPreset ? Ui.Theme.accentPrimary : Ui.Theme.textSecondary
                    lineHeight: 1
                }
            }
            NodeButton { objectName: "zoom-in"; text: ""; accessibleName: "Zoom in"; iconName: "add"; variant: NodeButton.Flat; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: root.viewport.run("Zoom in") }
            Rectangle { width: Ui.Metrics.border; height: Ui.Metrics.iconSm; color: roles.divider }
            NodeButton { objectName: "fit-selection"; text: ""; accessibleName: "Fit selection"; iconName: "filterCenterFocus"; variant: NodeButton.Flat; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: root.viewport.run("Fit selection") }
            NodeButton { objectName: "fit-view"; text: ""; accessibleName: "Fit view"; iconName: "centerFocusStrong"; variant: NodeButton.Flat; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: root.viewport.run("Fit") }
        }
    }
}

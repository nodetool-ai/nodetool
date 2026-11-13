import QtQuick
import QtQuick.Layouts
import QtQuick.Controls.Basic as Basic
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
            Ui.EditorButton { objectName: "zoom-out"; text: ""; display: Basic.AbstractButton.IconOnly; accessibleName: "Zoom out"; iconName: "remove"; variant: Ui.EditorButton.Outlined; flat: true; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: root.viewport.run("Zoom out") }
            Ui.ListRow {
                flat: true
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
            Ui.EditorButton { objectName: "zoom-in"; text: ""; display: Basic.AbstractButton.IconOnly; accessibleName: "Zoom in"; iconName: "add"; variant: Ui.EditorButton.Outlined; flat: true; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: root.viewport.run("Zoom in") }
            Rectangle { width: Ui.Metrics.border; height: Ui.Metrics.iconSm; color: roles.divider }
            Ui.EditorButton { objectName: "fit-selection"; text: ""; display: Basic.AbstractButton.IconOnly; accessibleName: "Fit selection"; iconName: "filterCenterFocus"; variant: Ui.EditorButton.Outlined; flat: true; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: root.viewport.run("Fit selection") }
            Ui.EditorButton { objectName: "fit-view"; text: ""; display: Basic.AbstractButton.IconOnly; accessibleName: "Fit view"; iconName: "centerFocusStrong"; variant: Ui.EditorButton.Outlined; flat: true; implicitWidth: Ui.Metrics.small; implicitHeight: Ui.Metrics.small; onClicked: root.viewport.run("Fit") }
        }
    }
}

import QtQuick
import QtQuick.Controls
import NodeTool.Timeline

// EditorButton contained, normal density: CONTROL.height.sm and paddingX.normal.
Button {
    id: button
    objectName: "exportButton"
    required property TimelineModel timeline
    property var panel: null
    readonly property color contentColor: TrackEffectsReference.data.palette.primaryContrast
    readonly property bool loading: panel !== null && panel.controller.running
    text: loading ? "Exporting…" : "Export"
    enabled: !loading
    implicitWidth: content.implicitWidth + 2 * Theme.spacingLg - Theme.spacingMicro
    implicitHeight: 28
    leftPadding: Theme.spacingLg - Theme.spacingMicro
    rightPadding: Theme.spacingLg
    topPadding: Theme.spacingXs
    bottomPadding: Theme.spacingXs
    font.family: Theme.sansFamily
    font.pixelSize: Theme.fontSizeSmaller
    font.weight: Font.Medium
    font.letterSpacing: 0.005 * Theme.fontSizeSmaller
    Accessible.name: text
    onClicked: {
        const target = TrackEffectsReference.windowItem(button, "exportPanel")
        if (target) target.open()
    }
    Component.onCompleted: Qt.callLater(() => { panel = TrackEffectsReference.windowItem(button, "exportPanel") })
    background: Rectangle {
        radius: Theme.radiusMd
        color: !button.loading && button.hovered ? TrackEffectsReference.data.palette.primaryDark : Theme.primary
    }
    contentItem: Row {
        id: content
        spacing: Theme.spacingMd
        Icon {
            objectName: "exportIcon"
            visible: !button.loading
            anchors.verticalCenter: parent.verticalCenter
            size: Theme.iconSm
            color: button.contentColor
            // Material FileDownload, using the existing Icon renderer.
            path: "M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z"
        }
        BusyIndicator {
            objectName: "exportSpinner"
            visible: button.loading
            running: visible
            width: Theme.iconSm
            height: Theme.iconSm
            padding: 0
            palette.dark: button.contentColor
            anchors.verticalCenter: parent.verticalCenter
        }
        Text {
            text: button.text
            font: button.font
            color: button.contentColor
            anchors.verticalCenter: parent.verticalCenter
        }
    }
}

import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    id: button
    objectName: "exportButton"
    required property TimelineModel timeline
    property var panel: null
    loading: panel !== null && panel.controller.running
    text: loading ? "Exporting…" : "Export"
    accessibleName: text
    variant: Ui.EditorButton.Primary
    density: Ui.EditorButton.Compact
    iconName: "fileDownload"
    onClicked: {
        const target = TrackEffectsReference.windowItem(button, "exportPanel")
        if (target) target.open()
    }
    Component.onCompleted: Qt.callLater(() => { panel = TrackEffectsReference.windowItem(button, "exportPanel") })
}

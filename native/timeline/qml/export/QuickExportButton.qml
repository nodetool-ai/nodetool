// Exports with the last settings. It asks for a file name, queues the export
// and carries on. The full dialog stays on the Export button and Ctrl+M.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.EditorButton {
    id: button
    objectName: "quickExportButton"
    required property TimelineModel timeline
    property var panel: null
    text: "Quick export"
    accessibleName: text
    description: panel ? "Export with the last settings: " + panel.quickLabel : ""
    density: Ui.EditorButton.Compact
    iconName: "send"
    enabled: panel !== null && timeline.contentEndMs > 0
    disabledReason: "Add a clip before exporting."
    onClicked: if (panel) panel.quickExport()
    Component.onCompleted: Qt.callLater(() => { panel = TrackEffectsReference.windowItem(button, "exportPanel") })
}

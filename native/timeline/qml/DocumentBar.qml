// Mirrors ui_primitives/DocumentBar.tsx as TimelineDocumentBar.tsx fills it:
// the document name and its save status, then Undo and Redo. 40 px high.
// The leading row holds the layout menu. The right side holds Export, then
// the project settings. Panel toggles and the overflow menu have no native
// counterpart yet.
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: bar
    objectName: "documentBar"
    required property TimelineModel timeline
    property QtObject autosave: null
    // Controls after Undo and Redo, such as the layout menu.
    default property alias leading: leadingRow.data

    height: TimelineMetrics.documentBarHeight
    color: Ui.Theme.surfaceCanvas
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: Ui.Metrics.border
        color: Ui.Theme.borderSubtle
    }

    Row {
        x: Ui.Metrics.lg
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.md
        Ui.Text {
            objectName: "documentTitle"
            anchors.verticalCenter: parent.verticalCenter
            width: Math.min(implicitWidth, bar.width / 2)
            elide: Text.ElideRight
            text: bar.timeline.name
            role: Ui.Typography.SansLabel
            tone: Ui.Text.Primary
        }
        SaveStatus {
            anchors.verticalCenter: parent.verticalCenter
            autosave: bar.autosave
            compact: bar.width < TimelineMetrics.compactDocumentBarWidth
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        Row {
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.micro
            ToolButton {
                objectName: "undoButton"
                label: "Undo"
                iconOnly: true
                iconName: "undo"
                enabled: bar.timeline.undoStack.canUndo
                onClicked: bar.timeline.undoStack.undo()
            }
            ToolButton {
                objectName: "redoButton"
                label: "Redo"
                iconOnly: true
                iconName: "redo"
                enabled: bar.timeline.undoStack.canRedo
                onClicked: bar.timeline.undoStack.redo()
            }
        }
        Row {
            id: leadingRow
            anchors.verticalCenter: parent.verticalCenter
            spacing: Ui.Metrics.md
        }
    }
    Row {
        anchors.right: parent.right
        anchors.rightMargin: Ui.Metrics.md
        anchors.verticalCenter: parent.verticalCenter
        spacing: Ui.Metrics.md
        SlotItems {
            anchors.verticalCenter: parent.verticalCenter
            slot: "documentBarActions"
            slotProperties: ({ timeline: bar.timeline })
        }
        SlotItems {
            anchors.verticalCenter: parent.verticalCenter
            slot: "documentBar"
            slotProperties: ({ timeline: bar.timeline })
        }
    }
}

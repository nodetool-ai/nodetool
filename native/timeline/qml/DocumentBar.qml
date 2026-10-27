// Mirrors ui_primitives/DocumentBar.tsx as TimelineDocumentBar.tsx fills it:
// the document name and its save status, then Undo and Redo. 40 px high.
// The web's layout menu, panel toggles and overflow menu have no native
// counterpart yet. The right actions slot holds Export.
import QtQuick
import NodeTool.Timeline

Rectangle {
    id: bar
    objectName: "documentBar"
    required property TimelineModel timeline
    property QtObject autosave: null

    height: 40                                          // DOCUMENT_BAR_HEIGHT
    color: Theme.backgroundDefault
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Theme.divider
    }

    Row {
        x: Theme.spacingLg
        anchors.verticalCenter: parent.verticalCenter
        spacing: Theme.spacingMd
        Text {
            objectName: "documentTitle"
            anchors.verticalCenter: parent.verticalCenter
            width: Math.min(implicitWidth, bar.width / 2)
            elide: Text.ElideRight
            text: bar.timeline.name
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeNormal
            font.weight: Font.Medium
        }
        SaveStatus {
            anchors.verticalCenter: parent.verticalCenter
            autosave: bar.autosave
            compact: bar.width < 640                    // COMPACT_BAR_WIDTH
        }
        ToolbarDivider { anchors.verticalCenter: parent.verticalCenter }
        Row {
            anchors.verticalCenter: parent.verticalCenter
            spacing: 2
            ToolButton {
                objectName: "undoButton"
                label: "Undo"
                iconOnly: true
                iconPath: Icons.undo
                opacity: bar.timeline.undoStack.canUndo ? 1 : 0.38
                onClicked: bar.timeline.undoStack.undo()
            }
            ToolButton {
                objectName: "redoButton"
                label: "Redo"
                iconOnly: true
                iconPath: Icons.redo
                opacity: bar.timeline.undoStack.canRedo ? 1 : 0.38
                onClicked: bar.timeline.undoStack.redo()
            }
        }
        SlotItems {
            anchors.verticalCenter: parent.verticalCenter
            slot: "documentBar"
            slotProperties: ({ timeline: bar.timeline })
        }
    }
    SlotItems {
        anchors.right: parent.right
        anchors.rightMargin: Theme.spacingMd
        anchors.verticalCenter: parent.verticalCenter
        slot: "documentBarActions"
        slotProperties: ({ timeline: bar.timeline })
    }
}

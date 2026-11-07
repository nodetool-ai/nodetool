import QtQuick
import QtQuick.Controls as Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    objectName: "externalConflictsBanner"
    readonly property var controller: typeof autosave !== "undefined" ? autosave : null
    readonly property var conflicts: controller ? controller.externalConflicts : []
    visible: conflicts.length > 0

    function editorAbove() {
        let item = parent
        while (item) {
            if (item.timeline !== undefined && item.clock !== undefined) {
                return item
            }
            item = item.parent
        }
        return null
    }

    component ConflictAction: Ui.EditorButton {
        density: Ui.EditorButton.Compact
        textTone: Ui.Text.Warning
    }

    // The overlay fills the editor. Only the buttons below take pointer input.
    Ui.Surface {
        objectName: "externalConflictsWarning"
        anchors.top: parent.top
        width: parent.width
        height: rows.implicitHeight + Ui.Metrics.lg * 2
        ColumnLayout {
            id: rows
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: Ui.Metrics.lg
            spacing: Ui.Metrics.sm
            Ui.Text {
                Layout.fillWidth: true
                text: root.conflicts.length === 1
                    ? "1 change made outside the editor conflicts with your edits."
                    : root.conflicts.length + " changes made outside the editor conflict with your edits."
                wrapMode: Text.WordWrap
                tone: Ui.Text.Warning
                role: Ui.Typography.SansBody
            }
            Repeater {
                model: root.conflicts
                RowLayout {
                    required property var modelData
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.md
                    Ui.Text {
                        Layout.fillWidth: true
                        text: modelData.label + ": " + modelData.reason
                        wrapMode: Text.WordWrap
                        tone: Ui.Text.Warning
                        role: Ui.Typography.SansLabel
                    }
                    ConflictAction {
                        objectName: "acceptExternalConflict-" + modelData.id
                        text: "Accept"
                        onClicked: {
                            const editor = root.editorAbove()
                            if (editor && root.controller) {
                                root.controller.acceptExternalConflict(modelData.id, editor.timeline)
                            }
                        }
                    }
                    ConflictAction {
                        objectName: "discardExternalConflict-" + modelData.id
                        text: "Discard"
                        onClicked: {
                            if (root.controller) {
                                root.controller.discardExternalConflict(modelData.id)
                            }
                        }
                    }
                }
            }
        }
    }
}

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.Storyboard
import NodeTool.Script

// One script in a document tab of a host app. The host supplies the
// controller (see StoryWorkspace.h), and this view keeps the drafts.
// Voicing needs the timeline app, so this view edits the text only.
Ui.Surface {
    id: editor
    variant: Ui.Surface.Canvas
    objectName: "scriptDocumentEditor"
    required property var controller
    readonly property alias workspace: drafts
    readonly property var resource: drafts.resource || ({})
    readonly property var rows: resource.document && resource.document.sections ? ScriptLines.rows(resource) : []
    StoryWorkspace { id: drafts; objectName: "scriptDrafts"; controller: editor.controller }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.lg
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            spacing: Ui.Metrics.sm
            Ui.Text {
                Layout.fillWidth: true
                text: editor.resource.name || "Untitled script"
                role: Ui.Typography.SansTitle
                elide: Text.ElideRight
                Accessible.role: Accessible.Heading
            }
            Ui.Text {
                text: drafts.dirty ? "Edited" : "Saved"
                role: Ui.Typography.SansCaption
                tone: drafts.dirty ? Ui.Text.Warning : Ui.Text.Secondary
            }
            Ui.EditorButton {
                objectName: "scriptSave"
                text: "Save"
                variant: Ui.EditorButton.Primary
                enabled: drafts.dirty && !editor.controller.busy
                onClicked: drafts.save()
            }
        }
        Ui.Text {
            Layout.fillWidth: true
            visible: text !== ""
            text: drafts.error || editor.controller.error || ""
            tone: Ui.Text.Error
            wrapMode: Text.Wrap
        }
        Ui.Text {
            visible: editor.controller.busy && !editor.resource.id
            text: "Loading script…"
            tone: Ui.Text.Secondary
        }
        ListView {
            id: lines
            objectName: "scriptLines"
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: Ui.Metrics.sm
            model: editor.rows
            ScrollBar.vertical: Ui.ScrollBar {}
            delegate: Column {
                id: row
                required property var modelData
                width: lines.width
                spacing: Ui.Metrics.xs
                Ui.Text {
                    visible: row.modelData.kind === "section" || !!row.modelData.showSpeaker
                    text: row.modelData.kind === "section" ? row.modelData.title : row.modelData.speakerName
                    role: row.modelData.kind === "section" ? Ui.Typography.SansLabel : Ui.Typography.SansCaption
                    tone: row.modelData.kind === "section" ? Ui.Text.Primary : Ui.Text.Secondary
                }
                Ui.TextArea {
                    visible: row.modelData.kind === "line"
                    width: parent.width
                    value: row.modelData.text || ""
                    accessibleName: "Line text"
                    enabled: !editor.controller.busy
                    onValueCommitted: next => drafts.replaceResource(ScriptLines.setLineText(drafts.resource, row.modelData.id, next))
                }
            }
        }
        Ui.EditorButton {
            objectName: "scriptAddLine"
            text: "Add line"
            density: Ui.EditorButton.Compact
            enabled: !!editor.resource.id && !editor.controller.busy
            onClicked: drafts.replaceResource(ScriptLines.addLine(drafts.resource))
        }
    }
}

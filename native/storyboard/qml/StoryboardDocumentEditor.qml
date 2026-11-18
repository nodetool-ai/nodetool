import QtQuick
import NodeTool.UiPrimitives as Ui
import NodeTool.Storyboard

// One storyboard in a document tab of a host app. The host supplies the
// controller (see StoryWorkspace.h), and this view keeps the drafts.
// Shot renders need the timeline app, so the board shows a message instead.
Ui.Surface {
    id: editor
    variant: Ui.Surface.Canvas
    objectName: "storyboardDocumentEditor"
    required property var controller
    readonly property alias workspace: drafts
    StoryWorkspace { id: drafts; objectName: "storyboardDrafts"; controller: editor.controller }
    QtObject {
        id: renders
        property bool busy: false
        property string state: ""
        property string error: ""
        function render() { error = "Render shots in the timeline app." }
        function accept() { error = "Render shots in the timeline app." }
        function cancel() {}
        function prompt() { return "" }
    }
    StoryboardBoard {
        anchors.fill: parent
        workspace: drafts
        controller: editor.controller
        renders: renders
    }
}

// nt-panel: slot=left id=transcript order=1 title="Text"
// Text-based editing: the sequence transcript and its caption segments. Both tabs read the document
// through one session, which the Transcript tab's selection and the Captions tab's edits go through.
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "../assets/AssetContext.js" as Context

Ui.Surface {
    id: panel
    variant: Ui.Surface.Canvas
    objectName: "timelineTextPanel"
    readonly property var editor: {
        var at = parent
        while (at && at.timeline === undefined) at = at.parent
        return at
    }
    readonly property var timeline: editor ? editor.timeline : null
    readonly property var clock: editor ? editor.clock : null
    readonly property real fps: timeline ? timeline.fps : 30
    property string tab: "transcript"
    clip: true

    function bindGestures() {
        if (!textSession.gestures && editor) textSession.gestures = Context.itemNamed(editor, "clipGestures")
    }
    onVisibleChanged: bindGestures()
    Component.onCompleted: { bindGestures(); Qt.callLater(bindGestures) }

    TranscriptSession {
        id: textSession
        timeline: panel.timeline
        active: panel.visible
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.md
        Row {
            objectName: "textTabs"
            spacing: Ui.Metrics.xs
            Repeater {
                model: [{id: "transcript", name: "Transcript"}, {id: "captions", name: "Captions"}]
                delegate: Ui.EditorButton {
                    required property var modelData
                    objectName: "textTab_" + modelData.id
                    density: Ui.EditorButton.Compact
                    variant: Ui.EditorButton.Flat
                    text: modelData.name
                    active: panel.tab === modelData.id
                    Accessible.role: Accessible.PageTab
                    Accessible.selected: active
                    onClicked: panel.tab = modelData.id
                }
            }
        }
        TranscriptTab {
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: panel.tab === "transcript"
            session: textSession
            clock: panel.clock
            timeline: panel.timeline
            fps: panel.fps
        }
        CaptionsTab {
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: panel.tab === "captions"
            session: textSession
            clock: panel.clock
            fps: panel.fps
        }
        Ui.Text {
            objectName: "textStatus"
            Layout.fillWidth: true
            visible: text !== ""
            text: textSession.status
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Warning
            wrapMode: Text.Wrap
            Accessible.role: Accessible.AlertMessage
            Accessible.name: text
        }
    }
}

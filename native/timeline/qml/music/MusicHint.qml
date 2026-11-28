// nt-panel: slot=tracksFooter id=musicHint order=10 title="Music hints"
// The hint line under the tracks in the Music layout (docs/MUSIC-MODE.md
// section 15, the music mode mockup): how the Range tool selects bars, and the
// keys that act on a selection, with chips from the keymap: in the Music layout
// [ and ] step through takes. It takes no height in other layouts.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui
import "MusicLayout.js" as MusicLayout

Rectangle {
    id: root
    objectName: "musicHint"
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property TimelineViewState viewState: null
    property var editor: null
    readonly property bool shown: !!editor && !!editor.dockStore && editor.dockStore.workspace === "Music" && sequence.isMusic
    // [{keys: [chip, ...], before, after}]; a part with no key shows its text alone.
    readonly property var parts: {
        const parts = [
            {keys: ["Alt"], before: qsTr("Drag on a lane to select bars. Hold"), after: qsTr("to place an edge freely.")},
            {keys: [], before: qsTr("Double-click a clip to select its span."), after: ""}
        ]
        const previous = shortcut("previousMusicTake")
        const next = shortcut("nextMusicTake")
        if (previous !== "" && next !== "")
            parts.push({keys: [previous, next], before: "", after: qsTr("step through takes while it loops.")})
        const remove = shortcut("deleteSelected")
        if (remove !== "") parts.push({keys: [remove], before: "", after: qsTr("deletes the selected clip.")})
        return parts
    }
    visible: shown
    implicitHeight: shown ? flow.implicitHeight + 2 * Ui.Metrics.sm : 0
    color: Ui.Theme.surfacePanel

    function shortcut(action) {
        return gestures && gestures.keyboardPreset !== "" ? gestures.shortcutFor(action) : ""
    }
    function attach() { editor = MusicLayout.editorOf(root) }
    Component.onCompleted: attach()
    Timer {
        interval: 50
        repeat: true
        running: !root.editor
        onTriggered: root.attach()
    }
    MusicSequenceState {
        id: sequence
        timeline: root.timeline
    }

    Rectangle {
        width: parent.width
        height: Ui.Metrics.border
        color: Ui.Theme.borderSubtle
    }
    Flow {
        id: flow
        x: Ui.Metrics.lg
        y: Ui.Metrics.sm
        width: parent.width - 2 * Ui.Metrics.lg
        spacing: Ui.Metrics.lg
        Repeater {
            model: root.parts
            delegate: Row {
                id: part
                required property var modelData
                required property int index
                objectName: "musicHintPart_" + index
                spacing: Ui.Metrics.xs
                Ui.Text {
                    visible: text !== ""
                    anchors.verticalCenter: parent.verticalCenter
                    text: part.modelData.before
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
                Repeater {
                    model: part.modelData.keys
                    delegate: Rectangle {
                        id: chip
                        required property string modelData
                        objectName: "musicHintKey_" + modelData
                        anchors.verticalCenter: parent.verticalCenter
                        width: keyText.implicitWidth + 2 * Ui.Metrics.xs
                        height: keyText.implicitHeight
                        radius: Ui.Metrics.radiusControl
                        color: Ui.Theme.surfaceInput
                        border.width: Ui.Metrics.border
                        border.color: Ui.Theme.borderControl
                        Ui.ShortcutHint {
                            id: keyText
                            anchors.centerIn: parent
                            text: chip.modelData
                        }
                    }
                }
                Ui.Text {
                    visible: text !== ""
                    anchors.verticalCenter: parent.verticalCenter
                    text: part.modelData.after
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                }
            }
        }
    }
}

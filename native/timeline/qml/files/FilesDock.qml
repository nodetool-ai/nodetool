// nt-panel: slot=left id=files order=5 title="Files"
import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.Files
import NodeTool.UiPrimitives as Ui
import "../assets/AssetContext.js" as Context

// The tree of the open timeline's project folder, from the shared
// NodeTool.Files package that the node editor's Files dock uses too. The dock
// tab closes it, so the panel shows no close button of its own.
// The preview plays a video or audio file of a local project folder through
// the timeline's own decoder (CandidatePreview), never Qt Multimedia. A
// folder on the server has no local file, so the preview keeps its glyph.
Item {
    id: host
    property var editor: null
    objectName: "projectFilesDock"
    implicitWidth: Ui.Metrics.panelWidth
    readonly property bool docked: !!parent && !!parent.dock
    width: docked ? parent.width : implicitWidth
    height: docked ? parent.height : parent && parent.parent ? parent.parent.height : TimelineMetrics.trackHeight * 9
    TimelineProjectFiles { id: source }
    FilesPanel {
        anchors.fill: parent
        files: source.files
        closable: false
        previewDelegate: Component {
            Item {
                id: player
                objectName: "files-preview-host"
                property url source
                property string kind
                property bool muted: false
                readonly property bool local: source.toString().startsWith("file:")
                function load() {
                    review.close()
                    if (local && (kind === "video" || kind === "audio")) review.previewFile(decodeURIComponent(source.toString().replace(/^file:\/\//, "")), kind, 0)
                }
                onSourceChanged: Qt.callLater(load)
                onKindChanged: Qt.callLater(load)
                Component.onDestruction: review.close()
                CandidatePreview {
                    id: review
                    objectName: "files-preview-review"
                    timeline: host.editor ? host.editor.timeline : null
                    audioMode: player.muted ? "none" : "system"
                    onTimelineChanged: Qt.callLater(player.load)
                }
                FrameAnimation {
                    running: review.previewClock.playing
                    onTriggered: {
                        review.previewClock.tick()
                        if (review.previewClock.time >= review.previewClock.durationMs) review.previewClock.pause()
                    }
                }
                PreviewCompositor {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.top: parent.top
                    anchors.bottom: controls.top
                    visible: review.ready && player.kind === "video"
                    timeline: review.previewTimeline
                    clock: review.previewClock
                }
                Ui.Icon {
                    anchors.centerIn: parent
                    visible: !review.ready && !review.busy && review.error === "" || player.kind === "audio" && review.ready
                    name: player.kind === "audio" ? "audiotrack" : "movie"
                    size: Ui.Metrics.xxxl
                }
                Ui.BusyIndicator {
                    anchors.centerIn: parent
                    running: review.busy
                    visible: running
                }
                Ui.Text {
                    anchors.centerIn: parent
                    width: parent.width - 2 * Ui.Metrics.md
                    visible: review.error !== ""
                    text: review.error
                    role: Ui.Typography.SansCaption
                    tone: Ui.Text.Secondary
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.Wrap
                }
                RowLayout {
                    id: controls
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    visible: review.ready
                    spacing: Ui.Metrics.xs
                    Ui.ToolbarIconButton {
                        objectName: "files-preview-play"
                        iconName: review.previewClock.playing ? "pause" : "playArrow"
                        accessibleName: review.previewClock.playing ? "Pause" : "Play"
                        text: accessibleName
                        onClicked: {
                            if (!review.previewClock.playing && review.previewClock.time >= review.previewClock.durationMs) review.previewClock.seek(0)
                            review.togglePlay()
                        }
                    }
                    Ui.Slider {
                        objectName: "files-preview-seek"
                        Layout.fillWidth: true
                        from: 0
                        to: Math.max(1, review.previewClock.durationMs)
                        value: review.previewClock.time
                        onValuePreviewed: next => review.previewClock.seek(next)
                        accessibleName: "Playback position"
                    }
                    Ui.Text {
                        text: TimelineFormat.clipDuration(review.previewClock.time)
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                    }
                    Ui.ToolbarIconButton {
                        objectName: "files-preview-mute"
                        iconName: player.muted ? "volumeOffOutlined" : "volumeUp"
                        accessibleName: player.muted ? "Unmute" : "Mute"
                        text: accessibleName
                        onClicked: player.muted = !player.muted
                    }
                }
            }
        }
    }
    Component.onCompleted: Qt.callLater(() => {
        const editor = Context.editorFor(host)
        host.editor = editor
        if (editor) {
            source.folder = editor.projectFolder || null
            source.autosave = editor.saver || null
        }
    })
}

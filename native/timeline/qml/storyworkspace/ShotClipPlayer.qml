import QtQuick
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

// Plays one clip take with a play button, a position slider, and the time.
Item {
    id: player
    objectName: "shotClipPlayer"
    property var timeline: null
    property string assetId: ""
    property real durationMs: 0
    readonly property bool busy: review.busy
    readonly property string error: review.error
    function togglePlay() { if (review.ready) review.togglePlay() }

    onAssetIdChanged: load()
    Component.onCompleted: load()
    Component.onDestruction: review.close()
    function load() {
        review.close()
        if (assetId !== "") review.preview(assetId, "video", durationMs)
    }

    CandidatePreview {
        id: review
        timeline: player.timeline
        audioMode: "system"
    }
    FrameAnimation {
        running: review.previewClock.playing
        onTriggered: {
            review.previewClock.tick()
            if (review.previewClock.time >= review.previewClock.durationMs) review.previewClock.pause()
        }
    }
    PreviewCompositor {
        anchors.fill: parent
        visible: review.ready
        timeline: review.previewTimeline
        clock: review.previewClock
    }
    Ui.Text {
        anchors.centerIn: parent
        width: parent.width - 2 * Ui.Metrics.lg
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.Wrap
        role: Ui.Typography.SansLabel
        tone: review.error !== "" ? Ui.Text.Error : Ui.Text.Secondary
        text: review.busy ? "Loading clip…" : review.error
        visible: text !== ""
    }
    RowLayout {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: Ui.Metrics.sm
        visible: review.ready
        spacing: Ui.Metrics.sm
        Ui.ToolbarIconButton {
            objectName: "shotClipPlay"
            iconName: review.previewClock.playing ? "pause" : "playArrow"
            text: review.previewClock.playing ? "Pause" : "Play"
            onClicked: review.togglePlay()
        }
        Ui.Slider {
            Layout.fillWidth: true
            from: 0
            to: Math.max(1, review.previewClock.durationMs)
            value: review.previewClock.time
            onValuePreviewed: next => review.previewClock.seek(next)
            accessibleName: "Playback position"
        }
        Ui.Text {
            text: (review.previewClock.time / 1000).toFixed(1) + " / " + (review.previewClock.durationMs / 1000).toFixed(1) + " s"
            role: Ui.Typography.MonoCaption
            tone: Ui.Text.Secondary
        }
    }
}

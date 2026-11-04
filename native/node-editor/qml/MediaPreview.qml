import QtQuick
import QtQuick.Layouts
import QtMultimedia
import NodeTool.NodeEditor.Media 1.0
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property string mediaKind
    required property var locator
    property string requestKey: "preview-" + String(root)
    property url resolvedSource: ""
    property string failure: ""
    property bool resolving: false
    readonly property bool playing: player.playbackState === MediaPlayer.PlayingState
    readonly property bool loading: resolving || image.status === Image.Loading || player.mediaStatus === MediaPlayer.LoadingMedia || player.mediaStatus === MediaPlayer.StalledMedia
    readonly property int position: player.position
    readonly property int duration: player.duration
    readonly property bool seekable: player.seekable
    spacing: Ui.Metrics.xs
    function reset() { if (mediaResolver) mediaResolver.cancel(requestKey); player.stop(); player.source = ""; video.clearFrame(); resolvedSource = ""; if (mediaResolver) mediaResolver.release(requestKey); failure = ""; resolving = false }
    function resolve() {
        reset()
        if (!locator || !mediaResolver) return
        resolving = true
        mediaResolver.resolve(requestKey, locator)
    }
    function time(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") }
    function togglePlayback() { if (playing) player.pause(); else player.play() }
    function seek(ms) { if (player.seekable) player.position = Math.max(0, Math.min(player.duration, ms)) }
    onLocatorChanged: resolve()
    onMediaKindChanged: resolve()
    onVisibleChanged: if (!visible) player.stop()
    Component.onCompleted: resolve()
    Component.onDestruction: reset()
    Connections {
        target: mediaResolver
        function onResolved(key, url) {
            if (key !== root.requestKey) return
            root.resolving = false
            root.resolvedSource = url
            if (root.mediaKind !== "image") player.source = url
        }
        function onFailed(key, message) { if (key === root.requestKey) { root.reset(); root.failure = message } }
        function onCleared() { root.reset() }
    }
    MediaPlayer {
        id: player
        objectName: "preview-player"
        autoPlay: false
        audioOutput: AudioOutput { id: audio; volume: 0.7 }
        videoOutput: video.videoSink
        onErrorOccurred: (error, errorString) => { if (error !== MediaPlayer.NoError) root.failure = errorString || "Unable to play media" }
    }
    Item {
        Layout.fillWidth: true
        Layout.preferredHeight: root.mediaKind === "audio" ? Ui.Metrics.comfortable : Math.min(width * 9 / 16, Ui.Metrics.comfortable * 5)
        Image {
            id: image
            objectName: "preview-image"
            anchors.fill: parent
            visible: root.mediaKind === "image"
            source: visible ? root.resolvedSource : ""
            fillMode: Image.PreserveAspectFit
            asynchronous: true
            onStatusChanged: if (status === Image.Error) root.failure = "Unable to display image"
        }
        VideoFrameView {
            id: video
            objectName: "preview-video"
            anchors.fill: parent
            visible: root.mediaKind === "video"
        }
        Ui.Text { anchors.centerIn: parent; visible: root.mediaKind === "audio"; text: "Audio"; role: Ui.Typography.SansLabel }
    }
    Ui.Text { Layout.fillWidth: true; visible: root.loading; text: "Loading media…"; role: Ui.Typography.SansCaption }
    RowLayout {
        visible: root.failure.length > 0
        Layout.fillWidth: true
        Ui.Text { Layout.fillWidth: true; text: root.failure; role: Ui.Typography.SansCaption; wrapMode: Text.WrapAnywhere }
        NodeButton { text: "Retry"; variant: NodeButton.Flat; onClicked: root.resolve() }
    }
    RowLayout {
        visible: root.mediaKind !== "image"
        Layout.fillWidth: true
        spacing: Ui.Metrics.sm
        NodeButton { objectName: "preview-play"; text: root.playing ? "Pause" : "Play"; accessibleName: text; enabled: root.resolvedSource.toString().length > 0 && !root.failure; onClicked: root.togglePlayback() }
        Ui.Slider { objectName: "preview-seek"; Layout.fillWidth: true; accessibleName: "Seek media"; enabled: player.seekable; from: 0; to: Math.max(1, player.duration); value: player.position; onValueCommitted: value => root.seek(value) }
        Ui.Text { text: root.time(player.position) + " / " + root.time(player.duration); role: Ui.Typography.MonoCaption }
        NodeButton { objectName: "preview-mute"; text: audio.muted ? "Unmute" : "Mute"; accessibleName: text; variant: NodeButton.Flat; onClicked: audio.muted = !audio.muted }
        Ui.Slider { objectName: "preview-volume"; Layout.preferredWidth: Ui.Metrics.xxxl * 3; accessibleName: "Volume"; from: 0; to: 1; value: audio.volume; onValueCommitted: value => audio.volume = value }
    }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import QtMultimedia as QM
import NodeTool.UiPrimitives as Ui

// Plays one audio or video file: the picture for a video, then play or pause,
// seek, the time and mute. A host passes a URL that Qt Multimedia can open
// itself: a local file, or a server URL that needs no credentials.
// A compact player drops the duration from the time and uses icon buttons, for
// a narrow panel such as the Files preview.
ColumnLayout {
    id: player
    objectName: "mediaPlayer"
    property url source
    // "video" or "audio".
    property string kind: "audio"
    property bool compact: false
    property string label: ""
    readonly property bool video: kind === "video"
    readonly property bool playing: media.playbackState === QM.MediaPlayer.PlayingState
    readonly property bool muted: output.muted
    function clock(ms) {
        const total = Math.max(0, Math.floor(ms / 1000))
        const seconds = total % 60
        return Math.floor(total / 60) + ":" + (seconds < 10 ? "0" : "") + seconds
    }
    function toggle() { if (playing) media.pause(); else media.play() }
    function toggleMute() { output.muted = !output.muted }
    spacing: player.compact ? Ui.Metrics.xs : Ui.Metrics.sm
    Component.onDestruction: media.stop()
    QM.MediaPlayer {
        id: media
        objectName: "mediaPlayerEngine"
        source: player.source
        audioOutput: QM.AudioOutput { id: output }
        // Always bound: a binding that starts at null (kind defaults to audio)
        // and switches later can leave the sink detached, and the picture black.
        videoOutput: videoView.videoSink
        property bool posterShown: false
        onSourceChanged: { posterShown = false; videoView.clearFrame() }
        onMediaStatusChanged: {
            if (mediaStatus === QM.MediaPlayer.EndOfMedia) {
                position = 0
            } else if (mediaStatus === QM.MediaPlayer.LoadedMedia && player.video && !posterShown) {
                // Qt Multimedia renders no frame until playback starts. Start
                // muted and pause on the first frame, so the preview shows it.
                posterShown = true
                posterPause.armed = true
                output.muted = true
                play()
            } else if (mediaStatus === QM.MediaPlayer.BufferedMedia && posterPause.armed) {
                posterPause.restart()
            }
        }
    }
    Timer {
        id: posterPause
        property bool armed: false
        interval: 1
        onTriggered: {
            if (!armed) return
            armed = false
            media.pause()
            media.position = 0
            output.muted = false
        }
    }
    VideoFrameItem {
        id: videoView
        objectName: "mediaPlayerVideo"
        visible: player.video
        Layout.fillWidth: true
        Layout.fillHeight: player.video
        Layout.preferredHeight: visible ? Math.min(width * 9 / 16, Ui.Metrics.comfortable * 8) : 0
    }
    RowLayout {
        Layout.fillWidth: true
        spacing: player.compact ? Ui.Metrics.xs : Ui.Metrics.sm
        Ui.ToolbarIconButton {
            objectName: "mediaPlayerPlay"
            visible: player.compact
            iconName: player.playing ? "pause" : "playArrow"
            accessibleName: (player.playing ? qsTr("Pause") : qsTr("Play")) + (player.label ? " " + player.label : "")
            text: accessibleName
            enabled: player.source.toString().length > 0
            onClicked: player.toggle()
        }
        Ui.EditorButton {
            objectName: "mediaPlayerPlayButton"
            visible: !player.compact
            iconName: player.playing ? "pause" : "playArrow"
            text: player.playing ? qsTr("Pause") : qsTr("Play")
            accessibleName: text + (player.label ? " " + player.label : "")
            enabled: player.source.toString().length > 0
            onClicked: player.toggle()
        }
        Ui.Slider {
            objectName: "mediaPlayerSeek"
            Layout.fillWidth: true
            from: 0
            to: Math.max(1, media.duration)
            value: media.position
            enabled: media.seekable
            accessibleName: qsTr("Playback position")
            onValueCommitted: next => media.setPosition(next)
        }
        Ui.Text {
            objectName: "mediaPlayerTime"
            text: player.compact ? player.clock(media.position) : player.clock(media.position) + " / " + player.clock(media.duration)
            role: Ui.Typography.MonoCaption
            tone: Ui.Text.Secondary
        }
        Ui.ToolbarIconButton {
            objectName: "mediaPlayerMute"
            iconName: output.muted ? "volumeOffOutlined" : "volumeUp"
            accessibleName: output.muted ? qsTr("Unmute") : qsTr("Mute")
            text: accessibleName
            onClicked: player.toggleMute()
        }
    }
    Ui.Text {
        objectName: "mediaPlayerError"
        visible: media.error !== QM.MediaPlayer.NoError
        text: media.errorString || qsTr("This media cannot be played here.")
        tone: Ui.Text.Error
        Layout.fillWidth: true
        wrapMode: Text.Wrap
    }
}

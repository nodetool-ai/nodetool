pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Layouts
import QtMultimedia
import NodeTool.UiPrimitives as Ui

// Plays one audio or video result in the message, as the web MediaOutputGroup
// does with its inline players. The source is a local file the session
// downloaded through the authenticated client, never a server URL.
ColumnLayout {
    id: player
    required property url source
    property bool video: false
    property string label: ""
    readonly property bool playing: media.playbackState === MediaPlayer.PlayingState
    function clock(ms) {
        const total = Math.max(0, Math.floor(ms / 1000))
        const seconds = total % 60
        return Math.floor(total / 60) + ":" + (seconds < 10 ? "0" : "") + seconds
    }
    spacing: Ui.Metrics.sm
    MediaPlayer {
        id: media
        source: player.source
        audioOutput: AudioOutput {}
        videoOutput: player.video ? videoView : null
    }
    VideoOutput {
        id: videoView
        objectName: "chatVideoOutput"
        visible: player.video
        Layout.fillWidth: true
        Layout.preferredHeight: visible ? Math.min(width * 9 / 16, Ui.Metrics.comfortable * 8) : 0
        fillMode: VideoOutput.PreserveAspectFit
    }
    RowLayout {
        Layout.fillWidth: true
        spacing: Ui.Metrics.sm
        Ui.EditorButton {
            objectName: "chatMediaPlay"
            iconName: player.playing ? "pause" : "playArrow"
            text: player.playing ? qsTr("Pause") : qsTr("Play")
            accessibleName: (player.playing ? qsTr("Pause") : qsTr("Play")) + " " + player.label
            onClicked: player.playing ? media.pause() : media.play()
        }
        Ui.Slider {
            objectName: "chatMediaSeek"
            Layout.fillWidth: true
            from: 0
            to: Math.max(1, media.duration)
            value: media.position
            enabled: media.seekable
            accessibleName: qsTr("Playback position")
            onValueCommitted: next => media.setPosition(next)
        }
        Ui.Text {
            text: player.clock(media.position) + " / " + player.clock(media.duration)
            role: Ui.Typography.MonoCaption
            tone: Ui.Text.Secondary
        }
    }
    Ui.Text {
        visible: media.error !== MediaPlayer.NoError
        text: media.errorString || qsTr("This media cannot be played here.")
        tone: Ui.Text.Error
        Layout.fillWidth: true
        wrapMode: Text.Wrap
    }
}

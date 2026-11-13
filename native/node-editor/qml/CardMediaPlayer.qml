import QtQuick
import QtMultimedia
import NodeTool.NodeEditor.Media 1.0
import NodeTool.UiPrimitives as Ui

// The players of a card's video and audio values, over the zone the card
// painter leaves for them. CanvasMediaPresenter places one per media field.
// Each item is {kind, locator, identity, rounded, compact}, and its geometry
// entry {x, y, width, height} is in card pixels relative to this overlay. A
// geometry change moves the players without reloading them.
Item {
    id: root
    required property var items
    property var geometry: []
    required property string requestKey
    required property string playerKey
    // The tab's MediaResolver, which reads each player's file.
    required property var resolver
    property real logicalWidth: 1
    property real logicalHeight: 1
    property real zoom: 1
    property real offsetX: 0
    property real offsetY: 0
    property real mediaOpacity: 1
    property bool released: false
    signal naturalSizeReported(string key, int index, int width, int height)
    clip: true
    function release() { released = true }
    function time(ms) {
        const s = Math.max(0, Math.floor(ms / 1000))
        return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0")
    }
    EditorRoles { id: roles }
    Item {
        x: root.offsetX
        y: root.offsetY
        width: root.logicalWidth
        height: root.logicalHeight
        scale: root.zoom
        transformOrigin: Item.TopLeft
        opacity: root.mediaOpacity
        Repeater {
            model: root.released ? [] : root.items
            delegate: Item {
                id: tile
                required property var modelData
                required property int index
                readonly property string kind: modelData.kind
                readonly property bool compact: modelData.compact === true
                readonly property string resolverKey: root.requestKey + ":" + index
                readonly property bool playing: player.playbackState === MediaPlayer.PlayingState
                property string failure: ""
                readonly property var bounds: root.geometry[index] || ({x: 0, y: 0, width: 0, height: 0})
                x: bounds.x
                y: bounds.y
                width: bounds.width
                height: bounds.height
                function resolve() {
                    failure = ""
                    if (root.resolver && modelData.locator) root.resolver.resolve(resolverKey, modelData.locator)
                }
                function toggle() { if (playing) player.pause(); else player.play() }
                Component.onCompleted: resolve()
                Component.onDestruction: {
                    player.stop()
                    if (root.resolver) { root.resolver.cancel(resolverKey); root.resolver.release(resolverKey) }
                }
                Connections {
                    target: root.resolver
                    function onResolved(key, url) {
                        if (key !== tile.resolverKey) return
                        player.source = url
                        if (tile.kind === "audio") wave.source = url
                        // A paused video shows its first frame, as the web's preload="metadata" poster.
                        else player.pause()
                    }
                    function onFailed(key, message) { if (key === tile.resolverKey) tile.failure = message }
                    function onCleared() { player.stop(); player.source = ""; tile.resolve() }
                }
                MediaPlayer {
                    id: player
                    objectName: "card-media-player"
                    audioOutput: AudioOutput { id: output }
                    videoOutput: tile.kind === "video" ? video.videoSink : null
                    onErrorOccurred: (error, errorString) => { if (error !== MediaPlayer.NoError) tile.failure = errorString }
                    onMediaStatusChanged: if (mediaStatus === MediaPlayer.EndOfMedia && loops !== MediaPlayer.Infinite) position = 0
                }
                Rectangle {
                    anchors.fill: parent
                    visible: tile.kind === "video"
                    color: roles.mediaScrimStrong
                    radius: tile.modelData.rounded ? Ui.Metrics.xs : Ui.Metrics.none
                }
                VideoFrameView {
                    id: video
                    objectName: "card-media-video"
                    anchors.fill: parent
                    visible: tile.kind === "video"
                }
                Connections {
                    target: tile.kind === "video" ? video.videoSink : null
                    function onVideoSizeChanged() {
                        const size = video.videoSink.videoSize
                        if (size.width > 0 && size.height > 0) root.naturalSizeReported(root.playerKey, tile.index, size.width, size.height)
                    }
                }
                // The web's native video controls: play, time and seek along the bottom edge.
                Rectangle {
                    visible: tile.kind === "video"
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    height: Ui.Metrics.compact
                    color: roles.mediaScrim
                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: Ui.Metrics.micro
                        anchors.rightMargin: Ui.Metrics.sm
                        spacing: Ui.Metrics.xs
                        Ui.ToolbarIconButton {
                            id: videoPlay
                            objectName: tile.kind === "video" ? "card-media-play" : ""
                            anchors.verticalCenter: parent.verticalCenter
                            iconName: tile.playing ? "pause" : "playArrow"
                            iconTone: Ui.Text.OnAccent
                            accessibleName: tile.playing ? "Pause video" : "Play video"
                            text: accessibleName
                            enabled: player.source.toString().length > 0 && !tile.failure
                            onClicked: tile.toggle()
                        }
                        Ui.Text {
                            anchors.verticalCenter: parent.verticalCenter
                            visible: !tile.compact
                            text: root.time(player.position)
                            role: Ui.Typography.MonoCaption
                            tone: Ui.Text.OnAccent
                        }
                        Ui.Slider {
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.max(0, parent.width - x)
                            accessibleName: "Seek video"
                            enabled: player.seekable
                            from: 0
                            to: Math.max(1, player.duration)
                            value: player.position
                            onValueCommitted: value => player.position = value
                        }
                    }
                }
                // AudioPlayer.tsx: the filename line, the waveform, then the play and
                // loop rows. A list row keeps the play control, time and seek.
                AudioWaveform {
                    id: wave
                    objectName: "card-media-waveform"
                    visible: tile.kind === "audio" && !tile.compact
                    x: Ui.Metrics.none
                    y: Ui.Metrics.xxxl
                    width: parent.width
                    height: Ui.Metrics.xl
                    waveColor: Ui.Theme.textSecondary
                    progressColor: Ui.Theme.accentPrimary
                    progress: player.duration > 0 ? player.position / player.duration : 0
                    viewportStart: 0
                    viewportEnd: 1
                    MouseArea {
                        anchors.fill: parent
                        enabled: player.seekable
                        onPressed: mouse => player.position = mouse.x / width * player.duration
                    }
                }
                Column {
                    visible: tile.kind === "audio"
                    x: tile.compact ? Ui.Metrics.md : Ui.Metrics.none
                    y: tile.compact ? Ui.Metrics.md : wave.y + wave.height + Ui.Metrics.lg
                    width: parent.width - 2 * x
                    spacing: Ui.Metrics.micro
                    Row {
                        width: parent.width
                        spacing: Ui.Metrics.xs
                        Ui.ToolbarIconButton {
                            objectName: tile.kind === "audio" ? "card-media-play" : ""
                            anchors.verticalCenter: parent.verticalCenter
                            iconName: tile.playing ? "pause" : "playArrow"
                            accessibleName: tile.playing ? "Pause audio" : "Play audio"
                            text: accessibleName
                            enabled: player.source.toString().length > 0 && !tile.failure
                            onClicked: tile.toggle()
                        }
                        Ui.Text {
                            anchors.verticalCenter: parent.verticalCenter
                            text: root.time(player.position) + " / " + root.time(player.duration)
                            role: Ui.Typography.MonoCaption
                        }
                        Ui.Slider {
                            anchors.verticalCenter: parent.verticalCenter
                            width: Math.max(0, parent.width - x)
                            accessibleName: "Seek audio"
                            enabled: player.seekable
                            from: 0
                            to: Math.max(1, player.duration)
                            value: player.position
                            onValueCommitted: value => player.position = value
                        }
                    }
                    Row {
                        visible: !tile.compact
                        spacing: Ui.Metrics.micro
                        Ui.ToolbarIconButton {
                            objectName: "card-media-loop"
                            iconName: "repeat"
                            accessibleName: player.loops === MediaPlayer.Infinite ? "Stop looping" : "Loop"
                            text: accessibleName
                            active: player.loops === MediaPlayer.Infinite
                            onClicked: player.loops = player.loops === MediaPlayer.Infinite ? 1 : MediaPlayer.Infinite
                        }
                        Ui.ToolbarIconButton {
                            objectName: "card-media-mute"
                            iconName: output.muted ? "volumeOffOutlined" : "volumeUp"
                            accessibleName: output.muted ? "Unmute" : "Mute"
                            text: accessibleName
                            onClicked: output.muted = !output.muted
                        }
                    }
                }
                Ui.Text {
                    anchors.centerIn: parent
                    width: parent.width - 2 * Ui.Metrics.md
                    visible: tile.failure.length > 0
                    text: tile.failure
                    role: Ui.Typography.SansCaption
                    tone: tile.kind === "video" ? Ui.Text.OnAccent : Ui.Text.Secondary
                    horizontalAlignment: Text.AlignHCenter
                    wrapMode: Text.Wrap
                }
            }
        }
    }
}

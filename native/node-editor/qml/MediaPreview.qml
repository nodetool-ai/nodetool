import QtQuick
import QtQuick.Layouts
import QtQuick.Window
import QtQuick.Dialogs
import QtCore
import QtMultimedia
import NodeTool.NodeEditor.Media 1.0
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    implicitHeight: content.implicitHeight
    property bool fullscreen: false
    property bool compact: false
    property bool fillPreview: false
    property real compactPreviewHeight: mediaKind === "audio" ? Ui.Metrics.xxxl * 2 + Ui.Metrics.lg : Ui.Metrics.comfortable * 2
    property string filename: locator && typeof locator === "object" ? String(locator.filename || locator.name || "") : ""
    property bool showFilename: true
    property real zoom: 1
    property real waveScroll: 0
    readonly property real viewFraction: Math.min(1, waveform.width / Math.max(1, player.duration / 1000 * zoom))
    readonly property real viewStart: waveScroll * (1 - viewFraction)
    property string downloadStatus: ""
    function setZoom(value) { zoom = Math.max(1, Math.min(100, value)); waveScroll = 0 }
    function download() {
        if (!mediaResolver || !resolvedSource.toString().length) return
        downloadStatus = ""
        downloadDialog.selectedFile = downloadDialog.currentFolder.toString() + "/" + mediaResolver.suggestedFilename(requestKey, filename, mediaKind)
        downloadDialog.open()
    }
    function toggleFullscreen() {
        if (mediaKind !== "video" || !resolvedSource.toString().length) return
        fullscreen = !fullscreen
        if (fullscreen) { fullscreenWindow.showFullScreen(); fullscreenWindow.requestActivate(); content.forceActiveFocus() }
        else { fullscreenWindow.hide(); fullscreenButton.forceActiveFocus() }
    }
    function exitFullscreen() { if (fullscreen) { fullscreen = false; fullscreenWindow.hide(); fullscreenButton.forceActiveFocus() } }
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
    function reset() { downloadDialog.close(); downloadStatus = ""; zoom = 1; waveScroll = 0; exitFullscreen(); if (mediaResolver) mediaResolver.cancel(requestKey); player.stop(); player.source = ""; video.clearFrame(); resolvedSource = ""; if (mediaResolver) mediaResolver.release(requestKey); failure = ""; resolving = false }
    function resolve() {
        reset()
        if (!locator || !mediaResolver) return
        resolving = true
        mediaResolver.resolve(requestKey, locator)
    }
    function time(ms) {
        const s = Math.max(0, Math.floor(ms / 1000))
        const minutes = Math.floor(s / 60) % 60
        const seconds = String(s % 60).padStart(2, "0")
        return s >= 3600 ? Math.floor(s / 3600) + ":" + String(minutes).padStart(2, "0") + ":" + seconds : minutes + ":" + seconds
    }
    function togglePlayback() { if (playing) player.pause(); else player.play() }
    function seek(ms) { if (player.seekable) player.position = Math.max(0, Math.min(player.duration, ms)) }
    onLocatorChanged: resolve()
    onMediaKindChanged: resolve()
    onVisibleChanged: if (!visible) { exitFullscreen(); player.stop() }
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
        function onSaved(key, destination) { if (key === root.requestKey) root.downloadStatus = "Saved media" }
        function onSaveFailed(key, message) { if (key === root.requestKey) root.downloadStatus = message }
    }
    MediaPlayer {
        id: player
        objectName: "preview-player"
        autoPlay: false
        audioOutput: AudioOutput { id: audio; volume: 1 }
        videoOutput: video.videoSink
        onMediaStatusChanged: {
            if (root.mediaKind === "audio" && mediaStatus === MediaPlayer.EndOfMedia && loops !== MediaPlayer.Infinite) position = 0
        }
        onPositionChanged: {
            if (root.mediaKind !== "audio" || !root.playing || root.viewFraction >= 1 || duration <= 0) return
            const fraction = position / duration
            if (fraction < root.viewStart || fraction > root.viewStart + root.viewFraction)
                root.waveScroll = Math.max(0, Math.min(1, (fraction - root.viewFraction / 2) / (1 - root.viewFraction)))
        }
        onErrorOccurred: (error, errorString) => { if (error !== MediaPlayer.NoError) root.failure = errorString || "Unable to play media" }
    }
    FileDialog {
        id: downloadDialog
        objectName: "preview-download-dialog"
        title: "Save media"
        fileMode: FileDialog.SaveFile
        currentFolder: StandardPaths.writableLocation(StandardPaths.DownloadLocation)
        onAccepted: { if (mediaResolver) mediaResolver.saveResolved(root.requestKey, selectedFile) }
    }
    Window {
        id: fullscreenWindow
        objectName: "preview-fullscreen-window"
        title: "Video preview"
        color: Ui.Theme.surfaceCanvas
        onClosing: event => { event.accepted = false; root.exitFullscreen() }
    }
    ColumnLayout {
        id: content
        parent: root.fullscreen ? fullscreenWindow.contentItem : root
        anchors.fill: parent
        spacing: Ui.Metrics.xs
        focus: root.fullscreen
        Keys.onEscapePressed: event => { root.exitFullscreen(); event.accepted = true }
        Ui.Text {
            objectName: "preview-filename"
            Layout.fillWidth: true
            visible: root.showFilename && root.filename.length > 0
            text: root.filename
            role: Ui.Typography.SansCaption
            elide: Text.ElideRight
        }
    Item {
        Layout.fillWidth: true
        Layout.fillHeight: root.fullscreen || root.fillPreview
        Layout.preferredHeight: root.compact && !root.fullscreen ? root.compactPreviewHeight : root.mediaKind === "audio" ? Ui.Metrics.comfortable : Math.min(width * 9 / 16, Ui.Metrics.comfortable * 5)
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
        AudioWaveform {
            id: waveform
            objectName: "preview-waveform"
            anchors.fill: parent
            visible: root.mediaKind === "audio"
            source: visible ? root.resolvedSource : ""
            waveColor: Ui.Theme.textSecondary
            progressColor: Ui.Theme.accentPrimary
            progress: player.duration > 0 ? player.position / player.duration : 0
            viewportStart: root.viewStart
            viewportEnd: root.viewStart + root.viewFraction
            MouseArea {
                anchors.fill: parent
                enabled: player.seekable
                onWheel: wheel => {
                    if (root.viewFraction < 1) root.waveScroll = Math.max(0, Math.min(1, root.waveScroll - wheel.angleDelta.y / 120 * root.viewFraction / 4))
                    wheel.accepted = true
                }
                onPressed: mouse => root.seek((root.viewStart + mouse.x / width * root.viewFraction) * player.duration)
                onPositionChanged: mouse => { if (pressed) root.seek((root.viewStart + mouse.x / width * root.viewFraction) * player.duration) }
            }
        }
    }
    AudioWaveform {
        id: minimap
        objectName: "preview-minimap"
        Layout.fillWidth: true
        Layout.preferredHeight: Ui.Metrics.md
        visible: root.mediaKind === "audio" && player.duration > 15000
        dataSource: waveform
        waveColor: Ui.Theme.textSecondary
        progressColor: Ui.Theme.accentPrimary
        progress: waveform.progress
        Rectangle {
            x: root.viewStart * parent.width
            width: root.viewFraction * parent.width
            height: parent.height
            color: Ui.Theme.actionSelected
            border.color: Ui.Theme.borderFocus
            border.width: Ui.Metrics.border
        }
        MouseArea {
            anchors.fill: parent
            enabled: player.seekable
            function moveTo(x) {
                root.seek(x / width * player.duration)
                if (root.viewFraction < 1) root.waveScroll = Math.max(0, Math.min(1, (x / width - root.viewFraction / 2) / (1 - root.viewFraction)))
            }
            onPressed: mouse => moveTo(mouse.x)
            onPositionChanged: mouse => { if (pressed) moveTo(mouse.x) }
        }
    }
    Ui.Slider {
        objectName: "preview-wave-scroll"
        Layout.fillWidth: true
        visible: !root.compact && root.mediaKind === "audio" && root.viewFraction < 1
        accessibleName: "Waveform horizontal position"
        from: 0; to: 1; value: root.waveScroll
        onValueCommitted: value => root.waveScroll = value
    }
    Ui.Text { Layout.fillWidth: true; visible: root.downloadStatus.length > 0; text: root.downloadStatus; role: Ui.Typography.SansCaption }
    Ui.Text { Layout.fillWidth: true; visible: root.loading; text: "Loading media…"; role: Ui.Typography.SansCaption }
    RowLayout {
        visible: root.failure.length > 0
        Layout.fillWidth: true
        Ui.Text { Layout.fillWidth: true; text: root.failure; role: Ui.Typography.SansCaption; wrapMode: Text.WrapAnywhere }
        NodeButton { text: "Retry"; variant: NodeButton.Flat; onClicked: root.resolve() }
    }
    RowLayout {
        visible: root.mediaKind !== "image" && (!root.compact || root.mediaKind !== "audio")
        Layout.fillWidth: true
        spacing: Ui.Metrics.sm
        NodeButton { objectName: "preview-play"; text: root.playing ? "Pause" : "Play"; accessibleName: text; enabled: root.resolvedSource.toString().length > 0 && !root.failure; onClicked: root.togglePlayback() }
        Ui.Slider { objectName: "preview-seek"; Layout.fillWidth: true; Layout.minimumWidth: 0; accessibleName: "Seek media"; enabled: player.seekable; from: 0; to: Math.max(1, player.duration); value: player.position; onValueCommitted: value => root.seek(value) }
        Ui.Text { text: root.time(player.position) + " / " + root.time(player.duration); role: Ui.Typography.MonoCaption }
    }
    Flow {
        Layout.fillWidth: true
        spacing: Ui.Metrics.sm
        visible: root.mediaKind !== "image"
        NodeButton { objectName: "preview-compact-play"; visible: root.compact && root.mediaKind === "audio"; text: root.playing ? "Pause" : "Play"; accessibleName: text; enabled: root.resolvedSource.toString().length > 0 && !root.failure; onClicked: root.togglePlayback() }
        Ui.Text { visible: root.compact && root.mediaKind === "audio"; text: root.time(player.position) + " / " + root.time(player.duration); role: Ui.Typography.MonoCaption; height: Ui.Metrics.standard; verticalAlignment: Text.AlignVCenter }
        Ui.Select {
            objectName: "preview-speed"
            visible: !root.compact || root.mediaKind !== "audio"
            accessibleName: "Playback speed"
            value: player.playbackRate
            options: [{ label: "0.5×", value: 0.5 }, { label: "1×", value: 1 }, { label: "1.5×", value: 1.5 }, { label: "2×", value: 2 }]
            onValueCommitted: value => player.playbackRate = value
        }
        Ui.Slider {
            objectName: "preview-zoom"
            visible: root.mediaKind === "audio"
            width: Ui.Metrics.xxxl * (root.compact ? 3 : 4)
            accessibleName: "Zoom audio waveform"
            from: 1; to: 100; stepSize: 1; value: root.zoom
            onValueCommitted: value => root.setZoom(value)
        }
        NodeButton { objectName: "preview-fit"; visible: !root.compact && root.mediaKind === "audio"; text: "Fit"; accessibleName: "Fit audio waveform"; variant: NodeButton.Flat; onClicked: root.setZoom(1) }
        NodeButton {
            objectName: "preview-loop"
            checkable: true
            checked: player.loops === MediaPlayer.Infinite
            visible: root.mediaKind === "audio"
            text: player.loops === MediaPlayer.Infinite ? "Stop looping" : "Loop"
            accessibleName: text
            variant: NodeButton.Flat
            onClicked: player.loops = player.loops === MediaPlayer.Infinite ? 1 : MediaPlayer.Infinite
        }
        NodeButton {
            id: fullscreenButton
            objectName: "preview-fullscreen"
            visible: root.mediaKind === "video"
            text: root.fullscreen ? "Exit fullscreen" : "Fullscreen"
            accessibleName: text
            enabled: root.resolvedSource.toString().length > 0 && !root.failure
            variant: NodeButton.Flat
            onClicked: root.toggleFullscreen()
        }
        NodeButton { objectName: "preview-mute"; checkable: true; checked: audio.muted; text: audio.muted ? "Unmute" : "Mute"; accessibleName: text; variant: NodeButton.Flat; onClicked: audio.muted = !audio.muted }
        Ui.Slider { objectName: "preview-volume"; visible: !root.compact || root.mediaKind !== "audio"; width: Ui.Metrics.xxxl * 3; accessibleName: "Volume"; from: 0; to: 1; value: audio.volume; onValueCommitted: value => audio.volume = value }
        NodeButton { objectName: "preview-download"; text: "Download"; accessibleName: "Download media"; variant: NodeButton.Flat; enabled: root.resolvedSource.toString().length > 0 && !root.failure; onClicked: root.download() }
    }
}
}

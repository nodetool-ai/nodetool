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
    property bool interactiveImage: false
    signal imageActivated()
    property real imageZoom: 1
    property real imagePanX: 0
    property real imagePanY: 0
    function fitImage() { imageZoom = 1; imagePanX = 0; imagePanY = 0 }
    function zoomImage(value, x, y) {
        const next = Math.max(1, Math.min(16, value))
        const ratio = next / imageZoom
        imagePanX += (x - image.width / 2 - imagePanX) * (1 - ratio)
        imagePanY += (y - image.height / 2 - imagePanY) * (1 - ratio)
        imageZoom = next
        if (next === 1) fitImage()
    }
    property real compactPreviewHeight: mediaKind === "audio" ? Ui.Metrics.xxxl * 2 + Ui.Metrics.lg : Ui.Metrics.comfortable * 2
    property string filename: locator && typeof locator === "object" ? String(locator.filename || locator.name || "") : ""
    property bool showFilename: true
    property bool showDownload: mediaKind !== "image"
    // Web ContentCardBody VideoPreview offers Save to assets next to Download, on video only.
    property bool showSaveToAssets: mediaKind === "video"
    // Web ImageView and AssetViewer offer Copy for images, wherever Download is offered.
    property bool showCopy: mediaKind === "image" && showDownload
    property bool savingToAssets: false
    property real zoom: 1
    property real waveScroll: 0
    readonly property real viewFraction: Math.min(1, waveform.width / Math.max(1, player.duration / 1000 * zoom))
    readonly property real viewStart: waveScroll * (1 - viewFraction)
    property string downloadStatus: ""
    function setZoom(value) { zoom = Math.max(1, Math.min(100, value)); waveScroll = 0 }
    function download() {
        if (!root.resolver || !resolvedSource.toString().length) return
        downloadStatus = ""
        const suggested = root.resolver.suggestedFilename(resolverKey, filename, mediaKind)
        // A bare name typed into the dialog keeps the media's extension.
        downloadDialog.defaultSuffix = suggested.lastIndexOf(".") > 0 ? suggested.slice(suggested.lastIndexOf(".") + 1) : ""
        downloadDialog.selectedFile = downloadDialog.currentFolder.toString() + "/" + suggested
        downloadDialog.open()
    }
    function saveToAssets() {
        if (!root.resolver || !resolvedSource.toString().length || savingToAssets) return
        downloadStatus = ""
        savingToAssets = true
        if (!root.resolver.saveToAssets(resolverKey, filename, mediaKind)) savingToAssets = false
    }
    function copyImage() {
        if (!root.resolver || mediaKind !== "image" || !resolvedSource.toString().length) return
        downloadStatus = clipboard.copyImage(root.resolver.resolvedBytes(resolverKey)) ? "Copied!" : "Could not copy the image"
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
    // The tab's MediaResolver. A preview without one shows nothing.
    property var resolver: null
    property string requestKey: "preview-" + String(root)
    property string resolverKey: ""
    property url resolvedSource: ""
    property string failure: ""
    property bool resolving: false
    readonly property bool playing: player.playbackState === MediaPlayer.PlayingState
    readonly property bool loading: resolving || image.status === Image.Loading || player.mediaStatus === MediaPlayer.LoadingMedia || player.mediaStatus === MediaPlayer.StalledMedia
    readonly property int position: player.position
    readonly property int duration: player.duration
    readonly property bool seekable: player.seekable
    function reset() {
        heldImage.source = ""
        const previousKey = resolverKey
        resolverKey = ""
        fitImage(); downloadDialog.close(); downloadStatus = ""; savingToAssets = false; zoom = 1; waveScroll = 0; exitFullscreen()
        if (root.resolver && previousKey) root.resolver.cancel(previousKey)
        player.stop(); player.source = ""; video.clearFrame(); resolvedSource = ""
        if (root.resolver && previousKey) root.resolver.release(previousKey)
        failure = ""; resolving = false
    }
    function resolve() {
        const held = mediaKind === "image" && image.status === Image.Ready ? image.source : ""
        reset()
        heldImage.source = held
        if (!locator || !root.resolver) return
        resolverKey = requestKey
        resolving = true
        root.resolver.resolve(resolverKey, locator)
    }
    function time(ms) {
        const s = Math.max(0, Math.floor(ms / 1000))
        const minutes = Math.floor(s / 60) % 60
        const seconds = String(s % 60).padStart(2, "0")
        return s >= 3600 ? Math.floor(s / 3600) + ":" + String(minutes).padStart(2, "0") + ":" + seconds : minutes + ":" + seconds
    }
    function togglePlayback() { if (playing) player.pause(); else player.play() }
    function seek(ms) { if (player.seekable) player.position = Math.max(0, Math.min(player.duration, ms)) }
    // Initial properties also emit change signals during creation. Resolving only
    // after completion sends one request instead of cancelled duplicates. A
    // gallery changes the kind and the locator one after the other, so a change
    // resolves once both hold. Otherwise the player gets the previous item's file.
    // The timer belongs to this item, so a resolve never runs after it is destroyed.
    property bool completed: false
    Timer { id: resolveTimer; interval: 0; onTriggered: root.resolve() }
    onRequestKeyChanged: if (completed) resolveTimer.restart()
    onLocatorChanged: if (completed) resolveTimer.restart()
    onMediaKindChanged: if (completed) resolveTimer.restart()
    onVisibleChanged: if (!visible) { exitFullscreen(); player.stop() }
    Component.onCompleted: { completed = true; resolve() }
    Component.onDestruction: reset()
    Connections {
        target: root.resolver
        function onResolved(key, url) {
            if (key !== root.resolverKey) return
            root.resolving = false
            root.resolvedSource = url
            if (root.mediaKind !== "image") player.source = url
        }
        function onFailed(key, message) { if (key === root.resolverKey) { root.reset(); root.failure = message } }
        function onCleared() { root.reset() }
        function onSaved(key, destination) { if (key === root.resolverKey) root.downloadStatus = "Saved media" }
        function onSaveFailed(key, message) { if (key === root.resolverKey) root.downloadStatus = message }
        function onAssetSaved(key, assetId) {
            if (key !== root.resolverKey) return
            root.savingToAssets = false
            root.downloadStatus = "1 file added to assets"
        }
        function onAssetSaveFailed(key, message) {
            if (key !== root.resolverKey) return
            root.savingToAssets = false
            root.downloadStatus = "Failed to add " + root.mediaKind + " to assets"
        }
    }
    MediaClipboard { id: clipboard }
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
        parentWindow: root.Window.window
        title: "Save media"
        fileMode: FileDialog.SaveFile
        currentFolder: StandardPaths.writableLocation(StandardPaths.DownloadLocation)
        onAccepted: { if (root.resolver) root.resolver.saveResolved(root.resolverKey, selectedFile) }
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
        Keys.onEscapePressed: event => { if (root.fullscreen) { root.exitFullscreen(); event.accepted = true } else event.accepted = false }
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
        clip: true
        // The last image stays until the next one is ready, so a new result
        // replaces the old one without a blank frame.
        Image {
            id: heldImage
            objectName: "preview-held-image"
            anchors.fill: parent
            visible: root.mediaKind === "image" && status === Image.Ready && image.status !== Image.Ready
            fillMode: Image.PreserveAspectFit
            scale: root.imageZoom
            transform: Translate { x: root.imagePanX; y: root.imagePanY }
        }
        Image {
            id: image
            objectName: "preview-image"
            anchors.fill: parent
            visible: root.mediaKind === "image"
            source: visible ? root.resolvedSource : ""
            fillMode: Image.PreserveAspectFit
            asynchronous: true
            scale: root.imageZoom
            transform: Translate { x: root.imagePanX; y: root.imagePanY }
            onStatusChanged: {
                if (status === Image.Error) root.failure = "Unable to display image"
                if (status === Image.Ready || status === Image.Error) heldImage.source = ""
            }
        }
        MouseArea {
            objectName: "preview-image-interaction"
            anchors.fill: parent
            visible: root.mediaKind === "image"
            acceptedButtons: Qt.LeftButton | (root.interactiveImage ? Qt.RightButton : Qt.NoButton)
            property point previous
            cursorShape: root.interactiveImage ? (pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor) : Qt.PointingHandCursor
            onPressed: mouse => { previous = Qt.point(mouse.x, mouse.y); if (mouse.button === Qt.RightButton) root.fitImage() }
            onPositionChanged: mouse => {
                if (!root.interactiveImage || !(mouse.buttons & Qt.LeftButton)) return
                root.imagePanX = Math.max(-image.width * root.imageZoom / 2, Math.min(image.width * root.imageZoom / 2, root.imagePanX + mouse.x - previous.x))
                root.imagePanY = Math.max(-image.height * root.imageZoom / 2, Math.min(image.height * root.imageZoom / 2, root.imagePanY + mouse.y - previous.y))
                previous = Qt.point(mouse.x, mouse.y)
            }
            onDoubleClicked: mouse => {
                if (root.interactiveImage) root.zoomImage(root.imageZoom * 2, mouse.x, mouse.y)
                else root.imageActivated()
            }
            onWheel: wheel => {
                if (!root.interactiveImage) { wheel.accepted = false; return }
                root.zoomImage(root.imageZoom + wheel.angleDelta.y * 0.003, wheel.x, wheel.y)
                wheel.accepted = true
            }
            activeFocusOnTab: !root.interactiveImage
            Accessible.role: Accessible.Button
            Accessible.name: root.interactiveImage ? "Zoom and pan image" : "Open image viewer"
            Accessible.onPressAction: if (!root.interactiveImage) root.imageActivated()
            Keys.onReturnPressed: if (!root.interactiveImage) root.imageActivated()
            Keys.onSpacePressed: if (!root.interactiveImage) root.imageActivated()
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
    Ui.Text { Layout.fillWidth: true; visible: root.loading && !heldImage.visible; text: "Loading media…"; role: Ui.Typography.SansCaption }
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
        visible: root.mediaKind !== "image" || root.showDownload || root.showCopy
        NodeButton { objectName: "preview-open-image"; visible: root.mediaKind === "image" && !root.interactiveImage; text: "Open"; accessibleName: "Open image viewer"; variant: NodeButton.Flat; onClicked: root.imageActivated() }
        NodeButton { objectName: "preview-image-fit"; visible: root.interactiveImage; text: "Fit"; accessibleName: "Fit image"; variant: NodeButton.Flat; onClicked: root.fitImage() }
        Ui.Text { objectName: "preview-image-dimensions"; visible: root.interactiveImage; text: image.sourceSize.width + " × " + image.sourceSize.height; role: Ui.Typography.MonoCaption; height: Ui.Metrics.standard; verticalAlignment: Text.AlignVCenter }
        NodeButton { objectName: "preview-compact-play"; visible: root.compact && root.mediaKind === "audio"; text: root.playing ? "Pause" : "Play"; accessibleName: text; enabled: root.resolvedSource.toString().length > 0 && !root.failure; onClicked: root.togglePlayback() }
        Ui.Text { visible: root.compact && root.mediaKind === "audio"; text: root.time(player.position) + " / " + root.time(player.duration); role: Ui.Typography.MonoCaption; height: Ui.Metrics.standard; verticalAlignment: Text.AlignVCenter }
        Ui.Select {
            objectName: "preview-speed"
            visible: root.mediaKind !== "image" && (!root.compact || root.mediaKind !== "audio")
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
        NodeButton { objectName: "preview-mute"; visible: root.mediaKind !== "image"; checkable: true; checked: audio.muted; text: audio.muted ? "Unmute" : "Mute"; accessibleName: text; variant: NodeButton.Flat; onClicked: audio.muted = !audio.muted }
        Ui.Slider { objectName: "preview-volume"; visible: root.mediaKind !== "image" && (!root.compact || root.mediaKind !== "audio"); width: Ui.Metrics.xxxl * 3; accessibleName: "Volume"; from: 0; to: 1; value: audio.volume; onValueCommitted: value => audio.volume = value }
        NodeButton { objectName: "preview-copy"; visible: root.showCopy; text: "Copy"; accessibleName: "Copy image"; variant: NodeButton.Flat; enabled: root.resolvedSource.toString().length > 0 && !root.failure; onClicked: root.copyImage() }
        NodeButton { objectName: "preview-download"; visible: root.showDownload; text: "Download"; accessibleName: "Download media"; variant: NodeButton.Flat; enabled: root.resolvedSource.toString().length > 0 && !root.failure; onClicked: root.download() }
        NodeButton { objectName: "preview-save-assets"; visible: root.showDownload && root.showSaveToAssets; text: "Save to assets"; accessibleName: "Save " + root.mediaKind + " to assets"; variant: NodeButton.Flat; enabled: root.resolvedSource.toString().length > 0 && !root.failure && !root.savingToAssets; onClicked: root.saveToAssets() }
    }
}
}

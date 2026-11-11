import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

// Full-window viewer for the assets in the current folder. Arrow keys step, Escape closes.
Ui.Dialog {
    id: gallery
    objectName: "assetGallery"
    property var browser: null
    property int index: -1
    property bool showInfo: false
    property bool zoomed: false
    readonly property var items: browser ? browser.assets.filter(row => row.content_type !== "folder") : []
    readonly property var asset: index >= 0 && index < items.length ? items[index] : null
    readonly property string mediaType: browser && asset ? browser.mediaType(asset) : ""
    readonly property int stripNeighbours: 6
    readonly property var strip: {
        if (index < 0) return []
        const first = Math.max(0, index - stripNeighbours)
        return items.slice(first, Math.min(items.length, index + stripNeighbours + 1)).map((row, i) => ({row, position: first + i}))
    }

    function openAsset(row) {
        const position = items.findIndex(item => item.id === row.id)
        if (position < 0) return
        show(position)
        open()
    }
    function show(position) {
        if (position < 0 || position >= items.length) return
        index = position
        zoomed = false
        review.close()
        if (mediaType === "video" || mediaType === "audio") {
            const seconds = Number(asset.duration)
            review.preview(String(asset.id), mediaType, isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0)
        }
    }
    // Wheel and trackpad deltas add up until they pass one notch, then step one asset.
    property real wheelTravel: 0
    function wheelStep(delta) {
        wheelTravel += delta
        if (Math.abs(wheelTravel) < 120) return
        step(wheelTravel > 0 ? -1 : 1)
        wheelTravel = 0
    }
    function step(delta) { show(Math.max(0, Math.min(items.length - 1, index + delta))) }
    function formatBytes(bytes) {
        const value = Number(bytes)
        if (!isFinite(value) || value <= 0) return ""
        const units = ["B", "KB", "MB", "GB"]
        let size = value, unit = 0
        while (size >= 1024 && unit < units.length - 1) { size /= 1024; ++unit }
        return size.toFixed(unit === 0 ? 0 : 1) + " " + units[unit]
    }
    function formatDuration(seconds) {
        const total = Math.floor(Number(seconds) || 0)
        if (total <= 0) return ""
        const pad = n => String(n).padStart(2, "0")
        return pad(Math.floor(total / 60)) + ":" + pad(total % 60)
    }

    x: 0
    y: 0
    width: parent ? parent.width : 0
    height: parent ? parent.height : 0
    focus: true
    onClosed: { review.close(); index = -1 }
    onItemsChanged: if (opened && asset === null) close()

    CandidatePreview {
        id: review
        timeline: gallery.browser ? gallery.browser.timeline : null
        audioMode: "system"
    }
    FrameAnimation { running: gallery.opened && review.previewClock.playing; onTriggered: review.previewClock.tick() }

    contentItem: Item {
        focus: true
        Keys.onLeftPressed: gallery.step(-1)
        Keys.onRightPressed: gallery.step(1)
        Keys.onSpacePressed: if (review.ready) review.togglePlay()
        Keys.onPressed: event => {
            if (event.key === Qt.Key_I) { gallery.showInfo = !gallery.showInfo; event.accepted = true }
            else if (event.key === Qt.Key_Home) { gallery.show(0); event.accepted = true }
            else if (event.key === Qt.Key_End) { gallery.show(gallery.items.length - 1); event.accepted = true }
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: Ui.Metrics.none

            RowLayout {
                Layout.fillWidth: true
                Layout.margins: Ui.Metrics.md
                spacing: Ui.Metrics.sm
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.micro
                    Ui.Text {
                        objectName: "assetGalleryName"
                        Layout.fillWidth: true
                        text: gallery.asset ? gallery.asset.name || "Untitled" : ""
                        elide: Text.ElideMiddle
                        role: Ui.Typography.SansBody
                        tone: Ui.Text.Primary
                    }
                    Ui.Text {
                        text: gallery.items.length > 0 ? (gallery.index + 1) + " / " + gallery.items.length : ""
                        role: Ui.Typography.MonoCaption
                        tone: Ui.Text.Secondary
                    }
                }
                Ui.ToolbarIconButton {
                    objectName: "assetGalleryFavorite"
                    variant: Ui.EditorButton.Flat
                    readonly property bool favorite: !!gallery.asset && !!(gallery.asset.metadata || {}).favorite
                    iconName: favorite ? "star" : "starBorder"
                    text: favorite ? "Remove favorite" : "Add favorite"
                    enabled: !!gallery.asset && !gallery.browser.busy
                    onClicked: gallery.browser.setFavorite(gallery.asset.id, !favorite)
                }
                Ui.ToolbarIconButton {
                    objectName: "assetGalleryZoom"
                    variant: Ui.EditorButton.Flat
                    visible: gallery.mediaType === "image"
                    iconName: gallery.zoomed ? "fitScreen" : "fullscreen"
                    text: gallery.zoomed ? "Fit to window" : "Actual size"
                    onClicked: gallery.zoomed = !gallery.zoomed
                }
                Ui.ToolbarIconButton {
                    objectName: "assetGalleryInfo"
                    variant: Ui.EditorButton.Flat
                    iconName: "info"
                    text: gallery.showInfo ? "Hide details (I)" : "Show details (I)"
                    onClicked: gallery.showInfo = !gallery.showInfo
                }
                Ui.ToolbarIconButton {
                    objectName: "assetGalleryClose"
                    variant: Ui.EditorButton.Flat
                    iconName: "close"
                    text: "Close (Esc)"
                    onClicked: gallery.close()
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: Ui.Metrics.none
                Ui.ToolbarIconButton {
                    objectName: "assetGalleryPrevious"
                    Layout.leftMargin: Ui.Metrics.md
                    variant: Ui.EditorButton.Flat
                    iconName: "navigateBefore"
                    text: "Previous (←)"
                    enabled: gallery.index > 0
                    onClicked: gallery.step(-1)
                }
                Item {
                    id: stage
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.margins: Ui.Metrics.md
                    clip: true
                    WheelHandler {
                        objectName: "assetGalleryWheel"
                        enabled: !gallery.zoomed
                        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
                        onWheel: event => gallery.wheelStep(Math.abs(event.angleDelta.x) > Math.abs(event.angleDelta.y) ? event.angleDelta.x : event.angleDelta.y)
                    }
                    DragHandler {
                        objectName: "assetGallerySwipe"
                        enabled: !gallery.zoomed
                        target: null
                        yAxis.enabled: false
                        onActiveChanged: if (!active && Math.abs(translation.x) > stage.width / 8) gallery.step(translation.x > 0 ? -1 : 1)
                    }
                    Flickable {
                        id: imageView
                        anchors.fill: parent
                        visible: gallery.mediaType === "image"
                        contentWidth: gallery.zoomed ? Math.max(width, picture.implicitWidth) : width
                        contentHeight: gallery.zoomed ? Math.max(height, picture.implicitHeight) : height
                        interactive: gallery.zoomed
                        boundsBehavior: Flickable.StopAtBounds
                        ScrollBar.vertical: Ui.ScrollBar {}
                        ScrollBar.horizontal: Ui.ScrollBar {}
                        Image {
                            id: picture
                            objectName: "assetGalleryImage"
                            width: imageView.contentWidth
                            height: imageView.contentHeight
                            source: gallery.mediaType === "image" && gallery.asset ? gallery.browser.mediaUrl(gallery.asset.get_url || gallery.asset.thumb_url || "") : ""
                            asynchronous: true
                            fillMode: gallery.zoomed ? Image.Pad : Image.PreserveAspectFit
                            smooth: true
                            mipmap: true
                        }
                        TapHandler { onDoubleTapped: gallery.zoomed = !gallery.zoomed }
                    }
                    PreviewCompositor {
                        objectName: "assetGalleryVideo"
                        anchors.fill: parent
                        visible: gallery.mediaType === "video" && review.ready
                        timeline: review.previewTimeline
                        clock: review.previewClock
                    }
                    Ui.Icon {
                        anchors.centerIn: parent
                        visible: gallery.mediaType === "audio" && review.ready
                        size: Ui.Metrics.iconLg * 3
                        name: "audiotrack"
                        domainColor: TimelineVisuals.clipAccent("audio")
                    }
                    Ui.Text {
                        anchors.centerIn: parent
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                        wrapMode: Text.Wrap
                        role: Ui.Typography.SansLabel
                        tone: review.error !== "" || picture.status === Image.Error ? Ui.Text.Error : Ui.Text.Secondary
                        text: gallery.mediaType === "image" ? (picture.status === Image.Loading ? "Loading image…" : picture.status === Image.Error ? "The image could not be loaded." : "")
                            : gallery.mediaType === "video" || gallery.mediaType === "audio"
                                ? (review.busy ? "Loading…" : review.error !== "" ? review.error : "")
                            : gallery.asset ? "No preview for this file type." : ""
                        visible: text !== ""
                    }
                }
                Ui.ToolbarIconButton {
                    objectName: "assetGalleryNext"
                    Layout.rightMargin: Ui.Metrics.md
                    variant: Ui.EditorButton.Flat
                    iconName: "navigateNext"
                    text: "Next (→)"
                    enabled: gallery.index < gallery.items.length - 1
                    onClicked: gallery.step(1)
                }
                Ui.Surface {
                    objectName: "assetGalleryDetails"
                    visible: gallery.showInfo && !!gallery.asset
                    Layout.preferredWidth: TimelineMetrics.trackHeaderWidth
                    Layout.fillHeight: true
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: Ui.Metrics.lg
                        spacing: Ui.Metrics.md
                        Repeater {
                            model: gallery.asset ? [
                                {label: "Name", value: gallery.asset.name || ""},
                                {label: "Type", value: gallery.asset.content_type || ""},
                                {label: "Size", value: gallery.formatBytes(gallery.asset.size)},
                                {label: "Duration", value: gallery.formatDuration(gallery.asset.duration)},
                                {label: "Dimensions", value: picture.implicitWidth > 0 && gallery.mediaType === "image" ? picture.implicitWidth + " × " + picture.implicitHeight : ""},
                                {label: "Created", value: gallery.asset.created_at ? new Date(gallery.asset.created_at).toLocaleString(Qt.locale(), Locale.ShortFormat) : ""},
                                {label: "Tags", value: ((gallery.asset.metadata || {}).tags || []).join(", ")}
                            ].filter(row => row.value !== "") : []
                            delegate: ColumnLayout {
                                required property var modelData
                                Layout.fillWidth: true
                                spacing: Ui.Metrics.micro
                                Ui.Text { text: modelData.label; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                                Ui.Text { Layout.fillWidth: true; text: modelData.value; wrapMode: Text.WrapAnywhere; role: Ui.Typography.SansLabel }
                            }
                        }
                        Item { Layout.fillHeight: true }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Layout.leftMargin: Ui.Metrics.xl
                Layout.rightMargin: Ui.Metrics.xl
                visible: review.ready && (gallery.mediaType === "video" || gallery.mediaType === "audio")
                Ui.EditorButton {
                    objectName: "assetGalleryPlay"
                    iconName: review.previewClock.playing ? "pause" : "playArrow"
                    accessibleName: review.previewClock.playing ? "Pause" : "Play"
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

            ListView {
                objectName: "assetGalleryFilmstrip"
                Layout.alignment: Qt.AlignHCenter
                Layout.preferredWidth: Math.min(parent.width - 2 * Ui.Metrics.xl, count * (Ui.Metrics.comfortable * 2 + Ui.Metrics.sm))
                Layout.preferredHeight: Ui.Metrics.comfortable * 2
                Layout.margins: Ui.Metrics.md
                orientation: ListView.Horizontal
                spacing: Ui.Metrics.sm
                interactive: false
                model: gallery.strip
                WheelHandler {
                    acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
                    onWheel: event => gallery.wheelStep(Math.abs(event.angleDelta.x) > Math.abs(event.angleDelta.y) ? event.angleDelta.x : event.angleDelta.y)
                }
                delegate: Rectangle {
                    id: thumb
                    required property var modelData
                    readonly property bool current: modelData.position === gallery.index
                    readonly property string type: gallery.browser.mediaType(modelData.row)
                    readonly property string poster: modelData.row.thumb_url || (type === "image" ? modelData.row.get_url || "" : "")
                    width: Ui.Metrics.comfortable * 2
                    height: width
                    radius: Ui.Metrics.radiusControl
                    color: Ui.Theme.surfacePanel
                    border.width: current ? Ui.Metrics.focus : Ui.Metrics.border
                    border.color: current ? Ui.Theme.accentPrimary : Ui.Theme.borderSubtle
                    opacity: current ? 1 : 0.6
                    clip: true
                    Accessible.role: Accessible.Button
                    Accessible.name: modelData.row.name || "Asset"
                    Image {
                        id: thumbImage
                        anchors.fill: parent
                        anchors.margins: Ui.Metrics.border
                        source: gallery.browser.mediaUrl(thumb.poster)
                        asynchronous: true
                        fillMode: Image.PreserveAspectCrop
                        sourceSize: Qt.size(thumb.width * 2, thumb.height * 2)
                    }
                    Ui.Icon {
                        anchors.centerIn: parent
                        visible: thumbImage.status !== Image.Ready
                        size: Ui.Metrics.iconMd
                        name: thumb.type === "audio" ? "audiotrack" : thumb.type === "video" ? "videocam" : "layers"
                        domainColor: TimelineVisuals.clipAccent(thumb.type)
                    }
                    TapHandler { onTapped: gallery.show(thumb.modelData.position) }
                }
            }
        }
    }
}

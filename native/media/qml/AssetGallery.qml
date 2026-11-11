import QtQuick
import QtQuick.Controls
import QtQuick.Window
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import NodeTool.Media
import "AssetContext.js" as Context

// Full-window viewer for the assets in the current folder. Arrow keys step, Escape closes.
Ui.Dialog {
    id: gallery
    // The pages decode at the stage size in 256 px steps, so a window resize
    // decodes again only at a step, and all pages share one cache entry.
    readonly property size stageDecodeSize: Qt.size(Math.ceil(stage.width * Screen.devicePixelRatio / 256) * 256,
        Math.ceil(stage.height * Screen.devicePixelRatio / 256) * 256)
    objectName: "assetGallery"
    property var browser: null
    property Component videoPreview: null
    property int index: -1
    property bool showInfo: false
    property bool zoomed: false
    readonly property var items: browser ? browser.assets.filter(row => row.content_type !== "folder") : []
    readonly property var asset: index >= 0 && index < items.length ? items[index] : null
    readonly property string mediaType: browser && asset ? browser.mediaType(asset) : ""
    readonly property bool showingStill: mediaType === "image" || (!videoPreview && mediaType === "video")
    readonly property var previewItem: mediaPreview.item
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
    }
    function step(delta) { stage.step(delta) }
    function wheelStep(delta) { stage.wheelStep(delta) }
    readonly property var previousAsset: index > 0 ? items[index - 1] : null
    readonly property var nextAsset: index >= 0 && index + 1 < items.length ? items[index + 1] : null
    function neighbourUrl(row) {
        if (!row || !browser) return ""
        return browser.mediaType(row) === "image" ? browser.mediaUrl(row.get_url || row.thumb_url || "") : browser.mediaUrl(row.thumb_url || "")
    }
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
    onClosed: index = -1
    // Opens with a fade and a small zoom toward the viewer. Reduced motion makes both immediate.
    readonly property int transitionDuration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionNormal
    enter: Transition {
        NumberAnimation { property: "opacity"; from: 0; to: 1; duration: gallery.transitionDuration; easing.type: Easing.OutCubic }
        NumberAnimation { property: "scale"; from: 0.96; to: 1; duration: gallery.transitionDuration; easing.type: Easing.OutCubic }
    }
    exit: Transition {
        NumberAnimation { property: "opacity"; from: 1; to: 0; duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionQuick; easing.type: Easing.InCubic }
        NumberAnimation { property: "scale"; from: 1; to: 0.98; duration: Ui.Theme.reducedMotion ? 0 : Ui.Metrics.motionQuick; easing.type: Easing.InCubic }
    }
    onItemsChanged: if (opened && asset === null) close()

    contentItem: Item {
        focus: true
        Keys.onLeftPressed: gallery.step(-1)
        Keys.onRightPressed: gallery.step(1)
        Keys.onSpacePressed: if (gallery.previewItem && gallery.previewItem.ready) gallery.previewItem.togglePlay()
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
                SwipePager {
                    id: stage
                    objectName: "assetGalleryPager"
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    Layout.margins: Ui.Metrics.md
                    index: gallery.index
                    count: gallery.items.length
                    interactive: !gallery.zoomed
                    onStepped: delta => gallery.show(gallery.index + delta)
                    // Pinch opens actual size, pinch closed fits again, and a pinch closed on a fitted image closes the gallery.
                    PinchHandler {
                        objectName: "assetGalleryPinch"
                        target: null
                        enabled: gallery.mediaType === "image"
                        onActiveChanged: {
                            if (active) return
                            if (!gallery.zoomed && activeScale > 1.15) gallery.zoomed = true
                            else if (gallery.zoomed && activeScale < 0.87) gallery.zoomed = false
                            else if (!gallery.zoomed && activeScale < 0.75) gallery.close()
                        }
                    }
                    Repeater {
                        model: [{row: gallery.previousAsset, side: -1}, {row: gallery.nextAsset, side: 1}]
                        delegate: Image {
                            required property var modelData
                            objectName: modelData.side < 0 ? "assetGalleryPreviousPage" : "assetGalleryNextPage"
                            x: stage.offset + modelData.side * stage.pageWidth
                            width: stage.width
                            height: stage.height
                            // Neighbours stay loaded off the page, so a swipe never waits for a decode or an upload.
                            visible: !!modelData.row
                            source: gallery.opened ? gallery.neighbourUrl(modelData.row) : ""
                            sourceSize: gallery.stageDecodeSize
                            retainWhileLoading: true
                            asynchronous: true
                            fillMode: Image.PreserveAspectFit
                            smooth: true
                        }
                    }
                    Item {
                        id: page
                        x: stage.offset
                        width: stage.width
                        height: stage.height
                        Flickable {
                            id: imageView
                            anchors.fill: parent
                            visible: gallery.showingStill
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
                                source: gallery.showingStill && gallery.asset ? gallery.browser.mediaUrl((gallery.mediaType === "image" ? gallery.asset.get_url : "") || gallery.asset.thumb_url || gallery.asset.get_url || "") : ""
                                asynchronous: true
                                fillMode: gallery.zoomed ? Image.Pad : Image.PreserveAspectFit
                                // Fitted, the image decodes at the stage size, the same cache entry as its neighbour page.
                                sourceSize: gallery.zoomed ? undefined : gallery.stageDecodeSize
                                retainWhileLoading: true
                                smooth: true
                            }
                            TapHandler { onDoubleTapped: gallery.zoomed = !gallery.zoomed }
                        }
                        Loader {
                            id: mediaPreview
                            anchors.fill: parent
                            active: gallery.opened && (gallery.mediaType === "video" || gallery.mediaType === "audio") && !!gallery.asset && !!gallery.videoPreview
                            sourceComponent: gallery.videoPreview
                            onLoaded: {
                                item.assetId = Qt.binding(() => gallery.asset ? String(gallery.asset.id || "") : "")
                                item.mediaType = Qt.binding(() => gallery.mediaType)
                                item.durationMs = Qt.binding(() => {
                                    const seconds = Number(gallery.asset ? gallery.asset.duration : 0)
                                    return isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0
                                })
                            }
                        }
                        Ui.Icon {
                            anchors.centerIn: parent
                            visible: gallery.mediaType === "audio" && (!gallery.videoPreview || (!!gallery.previewItem && gallery.previewItem.ready))
                            size: Ui.Metrics.iconLg * 3
                            name: "audiotrack"
                            tone: Ui.Text.Success
                        }
                        Ui.Text {
                            anchors.centerIn: parent
                            width: parent.width
                            horizontalAlignment: Text.AlignHCenter
                            wrapMode: Text.Wrap
                            role: Ui.Typography.SansLabel
                            readonly property string previewError: gallery.previewItem ? gallery.previewItem.error || "" : ""
                            readonly property bool previewBusy: !!gallery.previewItem && !!gallery.previewItem.busy
                            tone: previewError !== "" || picture.status === Image.Error ? Ui.Text.Error : Ui.Text.Secondary
                            text: gallery.showingStill ? (picture.status === Image.Loading ? "Loading image…" : picture.status === Image.Error ? "The image could not be loaded." : "")
                                : (gallery.mediaType === "video" || gallery.mediaType === "audio") && !!gallery.videoPreview
                                    ? (previewBusy ? "Loading…" : previewError !== "" ? previewError : "")
                                : gallery.asset && gallery.mediaType !== "audio" ? "No preview for this file type." : ""
                            visible: text !== ""
                        }
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
                    Layout.preferredWidth: Ui.Metrics.panelWidth
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
                // The row keeps its space while the media loads, so the stage does not resize when it becomes ready.
                visible: (gallery.mediaType === "video" || gallery.mediaType === "audio") && !!gallery.videoPreview
                readonly property bool previewReady: !!gallery.previewItem && !!gallery.previewItem.ready
                readonly property bool previewPlaying: !!gallery.previewItem && !!gallery.previewItem.playing
                readonly property real previewTime: gallery.previewItem ? gallery.previewItem.time || 0 : 0
                readonly property real previewDurationMs: gallery.previewItem ? gallery.previewItem.durationMs || 0 : 0
                enabled: previewReady
                opacity: previewReady ? 1 : 0
                Behavior on opacity { enabled: !Ui.Theme.reducedMotion; NumberAnimation { duration: Ui.Metrics.motionQuick } }
                Ui.EditorButton {
                    objectName: "assetGalleryPlay"
                    iconName: parent.previewPlaying ? "pause" : "playArrow"
                    accessibleName: parent.previewPlaying ? "Pause" : "Play"
                    onClicked: if (gallery.previewItem) gallery.previewItem.togglePlay()
                }
                Ui.Slider {
                    Layout.fillWidth: true
                    from: 0
                    to: Math.max(1, parent.previewDurationMs)
                    value: parent.previewTime
                    onValuePreviewed: next => { if (gallery.previewItem) gallery.previewItem.seek(next) }
                    accessibleName: "Playback position"
                }
                Ui.Text {
                    text: (parent.previewTime / 1000).toFixed(1) + " / " + (parent.previewDurationMs / 1000).toFixed(1) + " s"
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
                    onWheel: event => stage.wheelStep(Math.abs(event.angleDelta.x) > Math.abs(event.angleDelta.y) ? event.angleDelta.x : event.angleDelta.y)
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
                        sourceSize: Context.thumbSize(thumb.width, thumb.height, Screen.devicePixelRatio)
                    }
                    Ui.Icon {
                        anchors.centerIn: parent
                        visible: thumbImage.status !== Image.Ready
                        size: Ui.Metrics.iconMd
                        name: thumb.type === "audio" ? "audiotrack" : thumb.type === "video" ? "videocam" : "layers"
                        tone: thumb.type === "audio" ? Ui.Text.Success : Ui.Text.Info
                    }
                    TapHandler { onTapped: gallery.show(thumb.modelData.position) }
                }
            }
        }
    }
}

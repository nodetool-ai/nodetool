import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Ui.Surface {
    id: root
    objectName: "assetPreview"
    property var browser: null
    property var asset: null
    property string audioMode: "none"
    readonly property string mediaType: browser && asset ? browser.mediaType(asset) : ""
    readonly property bool supported: ["image", "video", "audio"].indexOf(mediaType) >= 0
    implicitHeight: Ui.Metrics.comfortable * 7
    visible: asset !== null
    clip: true

    function loadPreview() {
        review.close()
        if (!asset || !supported) return
        const seconds = Number(asset.duration)
        review.preview(String(asset.id || ""), mediaType, isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0)
    }
    function openAsset(row) {
        asset = row
    }
    function closePreview() {
        review.close()
        asset = null
    }
    onAssetChanged: {
        review.close()
        Qt.callLater(loadPreview)
    }
    onBrowserChanged: closePreview()
    onVisibleChanged: { if (!visible) review.close() }
    Component.onDestruction: review.close()

    CandidatePreview {
        id: review
        objectName: "libraryPreviewService"
        timeline: root.browser ? root.browser.timeline : null
        audioMode: root.audioMode
    }
    Connections {
        target: root.browser
        function onTimelineChanged() { root.closePreview() }
    }
    Connections {
        target: root.browser ? root.browser.timeline : null
        function onDocumentReplaced() { root.closePreview() }
    }
    FrameAnimation { running: root.visible && review.previewClock.playing; onTriggered: review.previewClock.tick() }
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Ui.Metrics.md
        spacing: Ui.Metrics.md
        RowLayout {
            Layout.fillWidth: true
            Ui.Text {
                Layout.fillWidth: true
                text: root.asset ? String(root.asset.name || "Preview") : "Preview"
                elide: Text.ElideRight
                role: Ui.Typography.SansLabel
            }
            Ui.EditorButton { objectName: "assetPreviewClose"; text: "Close"; onClicked: root.closePreview() }
        }
        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.minimumHeight: Ui.Metrics.comfortable * 2
            PreviewCompositor {
                objectName: "assetPreviewPicture"
                anchors.fill: parent
                visible: review.ready && root.mediaType !== "audio"
                timeline: review.previewTimeline
                clock: review.previewClock
            }
            Ui.Text {
                anchors.centerIn: parent
                width: parent.width
                wrapMode: Text.Wrap
                horizontalAlignment: Text.AlignHCenter
                text: !root.supported ? "Preview is available for images, video and audio."
                    : review.busy ? "Downloading and loading preview…"
                    : review.error !== "" ? review.error
                    : review.ready && root.mediaType === "audio" ? "Audio preview"
                    : review.ready ? "" : "Preview could not be opened. Retry to load the media."
                role: Ui.Typography.SansLabel
                tone: review.error !== "" ? Ui.Text.Error : Ui.Text.Secondary
            }
        }
        Ui.EditorButton {
            objectName: "assetPreviewRetry"
            visible: root.supported && !review.busy && !review.ready
            text: "Retry preview"
            onClicked: root.loadPreview()
        }
        RowLayout {
            Layout.fillWidth: true
            visible: review.ready && root.mediaType !== "image"
            Ui.EditorButton {
                objectName: "assetPreviewPlay"
                iconName: review.previewClock.playing ? "pause" : "playArrow"
                accessibleName: review.previewClock.playing ? "Pause" : "Play"
                onClicked: review.togglePlay()
            }
            Ui.Slider {
                objectName: "assetPreviewSeek"
                Layout.fillWidth: true
                from: 0
                to: Math.max(1, review.previewClock.durationMs)
                value: review.previewClock.time
                onValuePreviewed: next => review.previewClock.seek(next)
                accessibleName: "Preview time"
            }
            Ui.Text {
                text: (review.previewClock.time / 1000).toFixed(1) + " / " + (review.previewClock.durationMs / 1000).toFixed(1) + " s"
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
            }
        }
    }
}

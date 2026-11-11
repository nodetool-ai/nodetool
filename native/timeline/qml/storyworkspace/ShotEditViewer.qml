import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui
import "shotDraft.js" as Draft

// The shot's still or clip, large enough to judge, with pan and zoom, a version pager, and
// "Set as current". A port of web ShotEditViewer.
ColumnLayout {
    id: viewer
    objectName: "shotEditViewer"
    required property var shot
    property var mediaBrowser: null
    property var timeline: null
    property bool readOnly: false
    property bool generating: false
    signal acceptRequested(string kind, int index)
    spacing: Ui.Metrics.md

    readonly property real minZoom: 0.25
    readonly property real maxZoom: 4
    readonly property real panStep: Ui.Metrics.xxl
    readonly property real swipeDistance: Ui.Metrics.xxxl
    readonly property var stillVersions: Draft.versions(shot, "still")
    readonly property var clipVersions: Draft.versions(shot, "clip")
    readonly property bool hasClip: clipVersions.length > 0 && ((shot.production || {}).media_strategy !== "still_motion_graphics")
    property string medium: defaultMedium()
    property int stillIndex: Draft.currentIndex(stillVersions, shot.keyframe)
    property int clipIndex: Draft.currentIndex(clipVersions, shot.clip)
    readonly property string shown: hasClip ? medium : "still"
    readonly property var versions: shown === "clip" ? clipVersions : stillVersions
    readonly property var current: shown === "clip" ? shot.clip : shot.keyframe
    readonly property int index: Math.min(shown === "clip" ? clipIndex : stillIndex, Math.max(versions.length - 1, 0))
    readonly property var previewed: versions.length > 0 ? versions[index] : null
    readonly property bool isCurrent: !!previewed && !!current && Draft.sameMedia(previewed, current)
    readonly property int acceptedIndex: Draft.currentIndex(versions, current)
    readonly property string typeName: shown === "clip" ? "clip" : "still"
    readonly property string assetId: previewed ? previewed.asset_id || ((previewed.uri || "").startsWith("asset://") ? previewed.uri.slice(8) : "") : ""
    property real zoom: 1
    property real panX: 0
    property real panY: 0

    // Shot-scoped state. A new shot resets it, as the web viewer keys its state on the shot id.
    property string seenShotId: ""
    property int seenStillCount: 0
    property string seenStill: ""
    property string seenClip: ""

    function key(ref) { return ref ? ref.asset_id || ref.uri || "" : "" }
    function defaultMedium() {
        return shot.clip || (!shot.keyframe && Draft.versions(shot, "clip").length > 0) ? "clip" : "still"
    }
    function reset() {
        seenShotId = shot.id
        seenStillCount = stillVersions.length
        seenStill = key(shot.keyframe); seenClip = key(shot.clip)
        medium = defaultMedium()
        stillIndex = Draft.currentIndex(stillVersions, shot.keyframe)
        clipIndex = Draft.currentIndex(clipVersions, shot.clip)
        setZoom(1)
    }
    // A take that lands while the viewer is open is the one the creator waits for: show it. A take
    // made current in the takes gallery is the one the creator chose: show it too.
    function observe() {
        if (seenShotId !== shot.id) { reset(); return }
        if (stillVersions.length !== seenStillCount) {
            const grew = stillVersions.length > seenStillCount
            seenStillCount = stillVersions.length
            if (grew) { stillIndex = stillVersions.length - 1; medium = "still" }
        }
        const still = key(shot.keyframe), clip = key(shot.clip)
        if (still !== seenStill || clip !== seenClip) {
            const showStill = still !== seenStill && still !== ""
            seenStill = still; seenClip = clip
            if (showStill) { stillIndex = Draft.currentIndex(stillVersions, shot.keyframe); medium = "still" }
            else if (clip !== "") { clipIndex = Draft.currentIndex(clipVersions, shot.clip); medium = "clip" }
        }
    }
    onShotChanged: observe()
    Component.onCompleted: reset()

    function step(delta) {
        const next = index + delta
        if (next < 0 || next >= versions.length) return
        if (shown === "clip") clipIndex = next
        else stillIndex = next
    }
    function setZoom(next) {
        zoom = Math.max(minZoom, Math.min(maxZoom, next))
        if (zoom === 1) { panX = 0; panY = 0 }
    }
    function accept() {
        if (!previewed || isCurrent) return
        acceptRequested(shown === "clip" ? "video" : "image", index)
    }

    onAssetIdChanged: if (assetId !== "" && shown === "still" && mediaBrowser) mediaBrowser.requestThumbnail(assetId)

    Rectangle {
        id: stage
        objectName: "shotEditStage"
        Layout.fillWidth: true
        Layout.fillHeight: true
        Layout.minimumHeight: Ui.Metrics.touch * 5
        radius: Ui.Metrics.radiusCard
        color: Ui.Theme.actionHover
        border.width: Ui.Metrics.border
        border.color: stage.activeFocus ? Ui.Theme.borderFocus : Ui.Theme.borderSubtle
        clip: true
        activeFocusOnTab: true
        Accessible.role: Accessible.Pane
        Accessible.name: (viewer.shown === "clip" ? "Clip" : "Still") + " preview for shot " + (viewer.shot.index + 1)
        Keys.onLeftPressed: viewer.step(-1)
        Keys.onRightPressed: viewer.step(1)
        Keys.onSpacePressed: if (clipPlayer.item) clipPlayer.item.togglePlay()

        Item {
            id: media
            x: (stage.width - width) / 2 + viewer.panX
            y: (stage.height - height) / 2 + viewer.panY
            width: stage.width
            height: stage.height
            scale: viewer.zoom
            Image {
                id: still
                objectName: "shotEditStill"
                anchors.fill: parent
                anchors.margins: Ui.Metrics.border
                visible: viewer.shown === "still"
                source: viewer.shown === "still" && viewer.assetId !== "" && viewer.mediaBrowser
                    ? viewer.mediaBrowser.originals[viewer.assetId] || viewer.mediaBrowser.thumbnails[viewer.assetId] || "" : ""
                fillMode: Image.PreserveAspectFit
                asynchronous: true
                smooth: true
                mipmap: true
            }
            // The player loads only for a clip, so a board with stills needs no video pipeline.
            Loader {
                id: clipPlayer
                objectName: "shotEditClip"
                anchors.fill: parent
                active: viewer.shown === "clip" && viewer.assetId !== ""
                source: "ShotClipPlayer.qml"
                onLoaded: {
                    item.timeline = Qt.binding(() => viewer.timeline)
                    item.durationMs = Qt.binding(() => { const seconds = Number(viewer.previewed ? viewer.previewed.duration : 0); return isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0 })
                    item.assetId = Qt.binding(() => viewer.assetId)
                }
            }
        }
        Ui.Text {
            anchors.centerIn: parent
            width: parent.width - 2 * Ui.Metrics.lg
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
            role: Ui.Typography.SansLabel
            tone: still.status === Image.Error ? Ui.Text.Error : Ui.Text.Secondary
            text: !viewer.previewed ? "No still has been rendered yet."
                : viewer.shown === "clip" ? ""
                : still.status === Image.Loading || still.source == "" ? "Loading image…"
                : still.status === Image.Error ? "The image could not be loaded." : ""
            visible: text !== ""
        }
        DragHandler {
            id: pan
            target: null
            enabled: !!viewer.previewed
            property real startX: 0
            property real startY: 0
            onActiveChanged: {
                if (active) { startX = viewer.panX; startY = viewer.panY; return }
                // Unzoomed, a sideways swipe changes the take.
                const dx = translation.x, dy = translation.y
                if (viewer.zoom === 1 && Math.abs(dx) >= viewer.swipeDistance && Math.abs(dx) > Math.abs(dy)) viewer.step(dx < 0 ? 1 : -1)
            }
            onTranslationChanged: if (active && viewer.zoom !== 1) { viewer.panX = startX + translation.x; viewer.panY = startY + translation.y }
            cursorShape: active ? Qt.ClosedHandCursor : Qt.OpenHandCursor
        }
        WheelHandler {
            acceptedModifiers: Qt.ControlModifier
            onWheel: event => viewer.setZoom(viewer.zoom * (event.angleDelta.y > 0 ? 1.25 : 0.8))
        }
        Rectangle {
            objectName: "shotEditGenerating"
            anchors.fill: parent
            radius: parent.radius
            visible: viewer.generating
            color: Ui.Theme.scrimMedia
            Ui.BusyIndicator { anchors.centerIn: parent; running: parent.visible }
        }
    }

    Flow {
        Layout.fillWidth: true
        spacing: Ui.Metrics.sm
        Row {
            visible: viewer.hasClip
            spacing: Ui.Metrics.none
            Accessible.role: Accessible.Grouping
            Accessible.name: "Preview media type"
            Repeater {
                model: [{label: "Still", value: "still"}, {label: "Clip", value: "clip"}]
                delegate: Ui.EditorButton {
                    required property var modelData
                    objectName: "shotEditMedium_" + modelData.value
                    text: modelData.label
                    density: Ui.EditorButton.Compact
                    active: viewer.shown === modelData.value
                    onClicked: viewer.medium = modelData.value
                }
            }
        }
        Ui.ToolbarIconButton {
            objectName: "shotEditPreviousVersion"
            iconName: "navigateBefore"
            text: "Previous version"
            enabled: viewer.index > 0
            onClicked: viewer.step(-1)
        }
        Ui.Text {
            objectName: "shotVersionPager"
            height: Ui.Metrics.compact
            verticalAlignment: Text.AlignVCenter
            role: Ui.Typography.MonoCaption
            tone: Ui.Text.Secondary
            text: viewer.versions.length > 0 ? "Version " + (viewer.index + 1) + " of " + viewer.versions.length : "No versions available"
        }
        Ui.ToolbarIconButton {
            objectName: "shotEditNextVersion"
            iconName: "navigateNext"
            text: "Next version"
            enabled: viewer.index < viewer.versions.length - 1
            onClicked: viewer.step(1)
        }
        Row {
            spacing: Ui.Metrics.micro
            Ui.ToolbarIconButton { objectName: "shotEditZoomOut"; iconName: "remove"; text: "Zoom out"; enabled: viewer.zoom > viewer.minZoom; onClicked: viewer.setZoom(viewer.zoom / 1.25) }
            Ui.EditorButton {
                objectName: "shotEditZoomReset"
                density: Ui.EditorButton.Compact
                variant: Ui.EditorButton.Flat
                text: Math.round(viewer.zoom * 100) + "%"
                accessibleName: "Reset zoom"
                onClicked: viewer.setZoom(1)
            }
            Ui.ToolbarIconButton { objectName: "shotEditZoomIn"; iconName: "add"; text: "Zoom in"; enabled: viewer.zoom < viewer.maxZoom; onClicked: viewer.setZoom(viewer.zoom * 1.25) }
        }
        Row {
            spacing: Ui.Metrics.micro
            Accessible.role: Accessible.Grouping
            Accessible.name: "Pan controls"
            Ui.ToolbarIconButton { iconName: "arrowUpward"; text: "Pan up"; enabled: !!viewer.previewed; onClicked: viewer.panY -= viewer.panStep }
            Ui.ToolbarIconButton { iconName: "arrowDownward"; text: "Pan down"; enabled: !!viewer.previewed; onClicked: viewer.panY += viewer.panStep }
            Ui.ToolbarIconButton { iconName: "navigateBefore"; text: "Pan left"; enabled: !!viewer.previewed; onClicked: viewer.panX -= viewer.panStep }
            Ui.ToolbarIconButton { iconName: "navigateNext"; text: "Pan right"; enabled: !!viewer.previewed; onClicked: viewer.panX += viewer.panStep }
        }
        Ui.Text {
            objectName: "shotEditTakeCaption"
            visible: viewer.versions.length > 0
            height: Ui.Metrics.compact
            verticalAlignment: Text.AlignVCenter
            role: Ui.Typography.SansCaption
            tone: Ui.Text.Secondary
            readonly property string type: viewer.shown === "clip" ? "Clip" : "Still"
            text: viewer.isCurrent ? "Current " + viewer.typeName + " · Take " + (viewer.index + 1)
                : viewer.current ? "Previewing " + viewer.typeName + " take " + (viewer.index + 1) + " · Current take " + (viewer.acceptedIndex + 1)
                : "Previewing " + viewer.typeName + " take " + (viewer.index + 1)
        }
        Ui.EditorButton {
            objectName: "shotEditSetCurrent"
            visible: !viewer.readOnly && !!viewer.previewed && !viewer.isCurrent
            density: Ui.EditorButton.Compact
            text: "Set as current"
            accessibleName: "Set " + viewer.typeName + " take " + (viewer.index + 1) + " as current"
            onClicked: viewer.accept()
        }
    }
}

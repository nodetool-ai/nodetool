// Mirrors web/src/components/timeline/Tracks/TrackLane.tsx: one row of
// clips. Its LaneClipModel holds only the clips inside the view state's clip
// window plus the clip under a gesture (D28), so the lane instantiates a few
// Clip items however long the track is. A press on the empty lane parks the
// playhead there, clamped to the sequence.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.TimelinePlayer
import NodeTool.UiPrimitives as Ui

Rectangle {
    id: lane
    property ClipLaneRow row: null
    property real retainedTop: 0
    property real retainedHeight: 0
    property string retainedType: ""
    property bool retainedLocked: false
    property bool retainedMuted: false
    property bool retainedVisible: false
    property string retainedTrackId: ""
    required property string trackId
    required property string trackType
    required property bool trackVisible
    required property bool locked
    required property bool muted
    required property double rowHeight
    required property TimelineModel timeline
    required property PlaybackClock clock
    required property TimelineViewState viewState
    required property ClipGestureController gestures

    signal clipMenuRequested(var context, Item area, real areaX, real areaY)
    signal laneMenuRequested(var context, Item area, real areaX, real areaY)
    signal editPointMenuRequested(var context, Item area, real areaX, real areaY)

    property string detailClipId: ""
    readonly property bool gesturePinned: gestures !== null && gestures.activeClipId !== ""
        && clips.pinnedClipInTrack
    readonly property bool retainedInteraction: gesturePinned || detailClipId !== ""
    function releaseDetail(id: string): void {
        if (detailClipId === id) { detailClipId = "" }
    }
    readonly property alias clipModel: clips
    readonly property bool mediaVisible: visible && (!viewState ||
        (y + height > viewState.scrollTopPx && y < viewState.scrollTopPx + viewState.viewportHeightPx))
    readonly property bool mutedSoundTrack: (trackType === "audio" || trackType === "midi") && muted

    objectName: visible && trackId !== "" ? "trackLane-" + trackId : "pooledLane"
    height: rowHeight
    color: Ui.Theme.surfaceCanvas
    opacity: trackVisible ? 1 : 0.55
    clip: true

    LaneClipModel {
        id: clips
        reuseDelegates: true
        timeline: lane.visible || lane.retainedInteraction ? lane.timeline : null
        trackId: lane.trackId
        viewState: lane.viewState
        // The clip under a gesture stays while it is outside the window (D28).
        pinnedClipId: lane.gestures && lane.gestures.activeClipId !== "" ? lane.gestures.activeClipId : lane.detailClipId
        detailPinnedClipId: lane.detailClipId
    }

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onPressed: function(mouse: MouseEvent): void {
            if (mouse.button === Qt.RightButton) {
                if (lane.locked) return
                const context = { trackId: lane.trackId, trackType: lane.trackType,
                                     timeMs: Math.max(0, mouse.x * lane.viewState.msPerPx), editable: true }
                lane.laneMenuRequested(context, this, mouse.x, mouse.y)
                return
            }
            const atMs = Math.max(0, mouse.x * lane.viewState.msPerPx)
            // Under a track select tool the press selects the block.
            if (lane.gestures && lane.gestures.pressLane(lane.trackId, atMs, mouse.modifiers)) return
            const p = mapToItem(null, mouse.x, mouse.y)
            if (lane.gestures) { lane.gestures.pressEmptyLane(lane.trackId, p.x, p.y, mouse.modifiers) }
        }
    }

    Rectangle {
        objectName: "selectedGap-" + lane.trackId
        readonly property gestureFeedback gap: lane.gestures.gapFeedback
        visible: gap.trackId === lane.trackId
        x: (gap.startMs ?? 0) / lane.viewState.msPerPx
        width: ((gap.endMs ?? 0) - (gap.startMs ?? 0)) / lane.viewState.msPerPx
        height: parent.height
        color: TimelineVisuals.alphaColor(Ui.Theme.accentPrimary, 0.18)
        border.width: Ui.Metrics.border
        border.color: Ui.Theme.accentPrimary
    }

    function openEditPointMenu(clipId: string, edge: string, area: Item, areaX: real, areaY: real): void {
        const cut = lane.gestures.editPointAt(clipId, edge)
        const context = { clipId: clipId, edge: edge, leftId: cut.leftId, rightId: cut.rightId,
                                  clipIds: cut.rightId ? [cut.rightId] : [], editable: true }
        lane.editPointMenuRequested(context, area, areaX, areaY)
    }

    ClipChromeLayer {
        id: chrome
        objectName: "clipChrome-" + lane.trackId
        model: clips
        viewState: lane.viewState
        y: 6
        height: Math.max(0, lane.height - 12)
        opacity: lane.mutedSoundTrack ? 0.5 : 1
        videoFill: TimelineVisuals.clipFill("video")
        audioFill: TimelineVisuals.clipFill("audio")
        overlayFill: TimelineVisuals.clipFill("overlay")
        midiFill: TimelineVisuals.clipFill("midi")
        adjustmentFill: TimelineVisuals.clipFill("adjustment")
        fallbackFill: TimelineVisuals.clipFill("model3d")
        canvas: Ui.Theme.surfaceCanvas
        ink: TimelineVisuals.clipText
        fxFill: TimelineVisuals.fxBadge
        fxInk: TimelineVisuals.overlayContrast
        dark: Ui.Theme.dark
        nameStyle: Ui.Typography.metricsCaption
        durationStyle: Ui.Typography.metricsMonoCaption
        bandHeight: TimelineMetrics.clipNameBandHeight
        small: Ui.Metrics.xs
        medium: Ui.Metrics.md
        micro: Ui.Metrics.micro
    }

    Repeater {
        model: clips
        onItemRemoved: (index, item) => {
            const departing = item as Clip
            if (departing) { departing.releaseIdentity() }
        }
        delegate: Clip {
            id: clipDelegate
            required property int stackingIndex
            layerChrome: !chromeDetail && chrome.overlapRevision >= 0 && !chrome.overlaps(clipId)
            onChromeDetailChanged: chrome.setDetailed(clipId, chromeDetail)
            onPreviousClipIdChanged: chrome.setDetailed(clipId, chromeDetail)
            Component.onCompleted: chrome.setDetailed(clipId, chromeDetail)
            stackOrder: stackingIndex
            stackCount: clips.trackClipCount
            onKeepDelegateChanged: {
                if (keepDelegate) { lane.detailClipId = clipId }
                else { lane.releaseDetail(clipId) }
            }
            onIdentityReleased: previousId => { lane.releaseDetail(previousId); chrome.setDetailed(previousId, false) }
            laneActive: lane.visible
            laneInViewport: lane.mediaVisible
            laneHeight: lane.height
            trackLocked: lane.locked
            mutedTrack: lane.mutedSoundTrack
            viewState: lane.viewState
            gestures: lane.gestures
            onClipMenuRequested: (context, area, px, py) => lane.clipMenuRequested(context, area, px, py)
            onEditPointMenuRequested: (clipId, edge, area, areaX, areaY) => lane.openEditPointMenu(clipId, edge, area, areaX, areaY)
        }
    }

    // borderBottom: 1px divider.
    Rectangle {
        anchors.bottom: parent.bottom
        width: parent.width
        height: 1
        color: Ui.Theme.borderSubtle
    }
}

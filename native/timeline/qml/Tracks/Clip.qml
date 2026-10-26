// Mirrors web/src/components/timeline/Tracks/Clip.tsx: the clip's place in
// the lane and its gestures. ClipBody draws it.
//
// A press on the body starts a move and a press on a trim handle a trim; the
// ClipGestureController runs both (useClipDrag.ts, useClipTrim.ts), takes
// the pointer, and applies the edit to the model as the pointer moves, so
// this item only follows its clip's startMs. The clip under a gesture is
// pinned in its LaneClipModel (D28) through the controller's activeClipId.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

Item {
    id: clipItem
    required property string clipId
    required property string name
    required property double startMs
    required property double durationMs
    required property string mediaType
    required property bool hidden
    required property bool locked
    required property double fadeInMs
    required property double fadeOutMs
    required property string fadeInShape
    required property string fadeOutShape
    required property string transitionType
    required property double transitionMs
    required property string mediaSource
    required property double inPointMs
    required property double sourceOutMs

    property double laneHeight: Theme.trackHeight
    property bool trackLocked: false
    property bool mutedTrack: false
    property TimelineViewState viewState
    property ClipGestureController gestures

    readonly property double msPerPx: viewState ? viewState.msPerPx : 10
    readonly property bool interactionLocked: locked || trackLocked
    readonly property bool selected: gestures !== null && gestures.selection.indexOf(clipId) >= 0
    readonly property bool underGesture: gestures !== null && gestures.activeClipId === clipId
    // MIN_TRIM_HANDLE_CLIP_WIDTH_PX: the two 8 px grips leave 12 px of body.
    readonly property bool trimHandles: width >= 28

    objectName: "clip-" + clipId
    x: startMs / msPerPx
    y: 6
    width: Math.max(4, durationMs / msPerPx)       // MIN_CLIP_WIDTH_PX
    height: Math.max(0, laneHeight - 12)
    z: underGesture ? 1 : 0
    opacity: mutedTrack ? 0.5 : 1

    property var clipData: gestures ? gestures.clipData(clipId) : ({})
    Connections {
        target: clipItem.gestures ? clipItem.gestures.timeline : null
        function onClipsChanged() { clipItem.clipData = clipItem.gestures.clipData(clipItem.clipId) }
    }

    ClipBody {
        z: 1
        clipData: clipItem.clipData
        timeline: clipItem.gestures ? clipItem.gestures.timeline : null
        gestures: clipItem.gestures
        anchors.fill: parent
        name: clipItem.name
        mediaType: clipItem.mediaType
        durationMs: clipItem.durationMs
        msPerPx: clipItem.msPerPx
        hovered: hover.hovered
        selected: clipItem.selected
        disabled: clipItem.hidden
        locked: clipItem.interactionLocked
        fadeInMs: clipItem.fadeInMs
        fadeOutMs: clipItem.fadeOutMs
        fadeInShape: clipItem.fadeInShape
        fadeOutShape: clipItem.fadeOutShape
        transitionType: clipItem.transitionType
        transitionMs: clipItem.transitionMs
        mediaSource: clipItem.mediaSource
        inPointMs: clipItem.inPointMs
        sourceOutMs: clipItem.sourceOutMs
        contentX: clipItem.x
        viewState: clipItem.viewState
        // Only a clip with a transition reads the scroll.
        visibleFromPx: clipItem.transitionMs > 0 && clipItem.viewState ? clipItem.viewState.scrollLeftPx - clipItem.x : 0
        visibleToPx: clipItem.transitionMs > 0 && clipItem.viewState
                     ? clipItem.viewState.scrollLeftPx + clipItem.viewState.viewportWidthPx - clipItem.x : width
    }

    RegistryContextMenu {
        id: clipMenu
        kind: "clip"
        gestures: clipItem.gestures
    }
    HoverHandler { id: hover }

    function press(part, mouse, area) {
        if (!clipItem.gestures) return
        const p = area.mapToItem(null, mouse.x, mouse.y)
        clipItem.gestures.pressClip(clipItem.clipId, part, p.x, p.y, mouse.modifiers)
    }

    MouseArea {
        objectName: "clipBodyArea"
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: clipItem.interactionLocked ? Qt.ForbiddenCursor : pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor
        onPressed: mouse => {
            if (mouse.button === Qt.RightButton) {
                if (clipItem.gestures && !clipItem.selected) clipItem.gestures.selection = [clipItem.clipId]
                clipMenu.context = { clipId: clipItem.clipId, clip: clipItem.clipData,
                                     selectedIds: clipItem.gestures ? clipItem.gestures.selection : [],
                                     editable: !clipItem.interactionLocked }
                clipMenu.popup(mouse.x, mouse.y)
            } else clipItem.press("body", mouse, this)
        }
    }
    // The trim grips (TRIM_HANDLE_WIDTH_PX), over the body.
    MouseArea {
        objectName: "clipTrimStart"
        z: 2
        visible: clipItem.trimHandles
        width: 8
        height: parent.height
        acceptedButtons: Qt.LeftButton
        cursorShape: clipItem.interactionLocked ? Qt.ForbiddenCursor : Qt.SizeHorCursor
        onPressed: mouse => clipItem.press("start", mouse, this)
    }
    MouseArea {
        objectName: "clipTrimEnd"
        z: 2
        visible: clipItem.trimHandles
        x: parent.width - width
        width: 8
        height: parent.height
        acceptedButtons: Qt.LeftButton
        cursorShape: clipItem.interactionLocked ? Qt.ForbiddenCursor : Qt.SizeHorCursor
        onPressed: mouse => clipItem.press("end", mouse, this)
    }
}

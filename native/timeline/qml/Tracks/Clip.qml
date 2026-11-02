// Mirrors web/src/components/timeline/Tracks/Clip.tsx: the clip's place in
// the lane and its gestures. ClipBody draws it.
//
// A press on the body starts a move and a press on a trim handle a trim; the
// ClipGestureController runs both (useClipDrag.ts, useClipTrim.ts), takes
// the pointer, and applies the edit to the model as the pointer moves, so
// this item only follows its clip's startMs. A move shows its steps through
// the controller's live list and writes the model only when needed. The clip under a gesture is
// pinned in its LaneClipModel (D28) through the controller's activeClipId.
pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

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

    property double laneHeight: TimelineMetrics.trackHeight
    property bool trackLocked: false
    property bool mutedTrack: false
    property TimelineViewState viewState
    property ClipGestureController gestures

    readonly property double msPerPx: viewState ? viewState.msPerPx : 10
    readonly property bool interactionLocked: locked || trackLocked
    readonly property bool selected: gestures !== null && gestures.selection.indexOf(clipId) >= 0
    readonly property bool underGesture: gestures !== null && gestures.activeClipId === clipId
    readonly property var toolPreview: gestures ? gestures.toolPreview : ({})
    // MIN_TRIM_HANDLE_CLIP_WIDTH_PX: the two 8 px grips leave 12 px of body.
    readonly property bool trimHandles: width >= 28

    objectName: "clip-" + clipId
    // A move shows its steps through the controller's live list until the
    // document has them.
    readonly property double liveStartMs: gestures && gestures.liveRevision >= 0 ? gestures.liveStartMs(clipId) : -1
    readonly property double liveDurationMs: liveStartMs >= 0 ? gestures.liveDurationMs(clipId) : -1
    x: (liveStartMs >= 0 ? liveStartMs : startMs) / msPerPx
    y: 6
    width: Math.max(4, (liveDurationMs >= 0 ? liveDurationMs : durationMs) / msPerPx)       // MIN_CLIP_WIDTH_PX
    height: Math.max(0, laneHeight - 12)
    z: underGesture ? TimelineMetrics.clipBodyLayer : Ui.Metrics.layerContent
    opacity: mutedTrack ? 0.5 : 1

    property var clipData: gestures ? gestures.clipData(clipId) : ({})
    Connections {
        target: clipItem.gestures ? clipItem.gestures.timeline : null
        function onClipsChanged() { if (clipItem.gestures.clipTouched(clipItem.clipId)) clipItem.clipData = clipItem.gestures.clipData(clipItem.clipId) }
    }

    ClipBody {
        id: clipBody
        z: TimelineMetrics.clipBodyLayer
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

    // Built on the first right-click, so a lane's clips stay cheap to create and scroll.
    property ClipContextMenu clipMenu: null
    Component {
        id: clipMenuComponent
        ClipContextMenu { gestures: clipItem.gestures }
    }
    signal editPointMenuRequested(string clipId, string edge, Item area, real areaX, real areaY)
    HoverHandler { id: hover }

    Loader {
        active: !!clipItem.gestures && clipItem.gestures.trimSourceRange.clipId === clipItem.clipId
        z: TimelineMetrics.trimHandleLayer
        sourceComponent: Item {
            id: sourceGuide
            objectName: "trimSourceGuide-" + clipItem.clipId
            readonly property var range: clipItem.gestures ? clipItem.gestures.trimSourceRange : ({})
            visible: range.clipId === clipItem.clipId
            readonly property real sourceX: ((range.startMs || 0) - clipItem.startMs) / clipItem.msPerPx
            readonly property real sourceEndX: ((range.endMs || 0) - clipItem.startMs) / clipItem.msPerPx
            Rectangle {
                visible: sourceGuide.range.hasSource === true && sourceGuide.range.bounded === true
                objectName: "trimSourceExtent-" + clipItem.clipId
                x: sourceGuide.sourceX
                width: Math.max(0, sourceGuide.sourceEndX - x)
                height: Ui.Metrics.border
                color: Ui.Theme.statusWarning
            }
            Rectangle {
                visible: sourceGuide.range.hasSource === true
                x: sourceGuide.sourceX
                width: Ui.Metrics.border
                height: Ui.Metrics.md
                color: Ui.Theme.statusWarning
            }
            Rectangle {
                visible: sourceGuide.range.bounded === true
                x: sourceGuide.sourceEndX
                width: Ui.Metrics.border
                height: Ui.Metrics.md
                color: Ui.Theme.statusWarning
            }
            Ui.Surface {
                objectName: "trimLimitFeedback-" + clipItem.clipId
                visible: sourceGuide.range.limitReason !== undefined && sourceGuide.range.limitReason !== ""
                variant: Ui.Surface.Overlay
                readonly property real leftBound: clipItem.viewState ? clipItem.viewState.scrollLeftPx - clipItem.x : 0
                readonly property real viewportWidth: clipItem.viewState ? clipItem.viewState.viewportWidthPx : clipItem.width
                width: Math.min(viewportWidth, reasonText.implicitWidth + 2 * Ui.Metrics.md)
                height: reasonText.implicitHeight + 2 * Ui.Metrics.sm
                x: Math.max(leftBound, Math.min(leftBound + viewportWidth - width,
                            (sourceGuide.range.edge === "start" ? 0 : clipItem.width) + Ui.Metrics.sm))
                y: Ui.Metrics.md
                Ui.Text {
                    id: reasonText
                    x: Ui.Metrics.md
                    y: Ui.Metrics.sm
                    width: parent.width - 2 * Ui.Metrics.md
                    text: sourceGuide.range.limitReason || ""
                    role: Ui.Typography.SansCaption
                    wrapMode: Text.Wrap
                }
            }
        }
    }

    function slotHit(area, x, y, button) {
        const hit = item => {
            if (!item.visible || !item.enabled) return null
            if (item instanceof MouseArea && item.takesTrimPress === true
                && (item.acceptedButtons & button) && item.contains(item.mapFromItem(area, x, y))) return item
            for (const child of item.children) {
                const target = hit(child)
                if (target) return target
            }
            return null
        }
        for (const item of clipBody.children) {
            if (item.slot !== "clipBody") continue
            const target = hit(item)
            if (target) return target
        }
        return null
    }
    function cursorFor(part, pressed, area) {
        if (part !== "body" && area.containsMouse) {
            const owner = slotHit(area, area.mouseX, area.mouseY, Qt.LeftButton)
            if (owner) return owner.cursorShape
        }
        if (interactionLocked || (toolPreview.clipId === clipId && toolPreview.available === false)) return Qt.ForbiddenCursor
        const tool = gestures ? gestures.activeTool : "select"
        if (tool === "cut" || tool === "zoom") return Qt.CrossCursor
        if (tool === "slip") return Qt.SplitHCursor
        if (tool === "slide") return Qt.SizeHorCursor
        if (tool === "trackSelect" || tool === "trackSelectBackward") return Qt.SizeAllCursor
        if (tool === "hand") return pressed ? Qt.ClosedHandCursor : Qt.OpenHandCursor
        if (part !== "body") return tool === "roll" ? Qt.SplitHCursor : Qt.SizeHorCursor
        return pressed || (underGesture && gestures.gestureKind === "move") ? Qt.ClosedHandCursor : Qt.OpenHandCursor
    }
    function updateToolPreview(part, area, modifiers) {
        if (!gestures) return
        if (part !== "body" && slotHit(area, area.mouseX, area.mouseY, Qt.LeftButton)) {
            gestures.clearToolHover(clipId)
            return
        }
        const point = area.mapToItem(null, area.mouseX, area.mouseY)
        gestures.updateToolHover(clipId, part, point.x, point.y, modifiers || 0)
    }
    Connections {
        target: clipItem.gestures
        function onOptionsChanged() {
            if (startArea.containsMouse) clipItem.updateToolPreview("start", startArea, 0)
            else if (endArea.containsMouse) clipItem.updateToolPreview("end", endArea, 0)
            else if (bodyArea.containsMouse) clipItem.updateToolPreview("body", bodyArea, 0)
        }
    }
    Rectangle {
        objectName: "razorPreview-" + clipItem.clipId
        visible: clipItem.toolPreview.timeMs !== undefined && !!clipItem.gestures && clipItem.gestures.previewsCut(clipItem.clipId)
        x: ((clipItem.toolPreview.timeMs || 0) - clipItem.startMs) / clipItem.msPerPx
        width: Ui.Metrics.focus
        height: parent.height
        z: TimelineMetrics.trimHandleLayer
        color: Ui.Theme.statusWarning
    }

    function press(part, mouse, area) {
        if (!clipItem.gestures) return
        if (part !== "body" && slotHit(area, mouse.x, mouse.y, mouse.button)) {
            mouse.accepted = false
            return
        }
        const p = area.mapToItem(null, mouse.x, mouse.y)
        clipItem.gestures.pressClip(clipItem.clipId, part, p.x, p.y, mouse.modifiers)
    }

    MouseArea {
        id: bodyArea
        objectName: "clipBodyArea"
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        hoverEnabled: true
        cursorShape: clipItem.cursorFor("body", pressed, this)
        onEntered: clipItem.updateToolPreview("body", this, 0)
        onPositionChanged: mouse => clipItem.updateToolPreview("body", this, mouse.modifiers)
        onExited: if (clipItem.gestures) clipItem.gestures.clearToolHover(clipItem.clipId)
        onPressed: mouse => {
            if (mouse.button === Qt.RightButton) {
                if (clipItem.gestures && clipItem.gestures.parent) clipItem.gestures.parent.forceActiveFocus(Qt.MouseFocusReason)
                if (clipItem.gestures && !clipItem.selected) clipItem.gestures.selection = [clipItem.clipId]
                if (!clipItem.clipMenu) clipItem.clipMenu = clipMenuComponent.createObject(clipItem)
                const clock = clipItem.gestures ? clipItem.gestures.clock : null
                clipItem.clipMenu.context = { clipId: clipItem.clipId, clip: clipItem.clipData,
                                     clipIds: clipItem.gestures ? clipItem.gestures.selection.slice() : [clipItem.clipId], mediaType: clipItem.mediaType,
                                     selectedIds: clipItem.gestures ? clipItem.gestures.selection : [],
                                     playheadMs: clock ? clock.time : 0,
                                     editable: !clipItem.interactionLocked }
                clipItem.clipMenu.popupAt(this, mouse.x, mouse.y)
            } else clipItem.press("body", mouse, this)
        }
    }
    // The edit point E and the keyboard trims act on.
    Rectangle {
        objectName: "clipSelectedEdit"
        readonly property string edge: clipItem.gestures && clipItem.gestures.selectedEdit.clipId === clipItem.clipId
            ? clipItem.gestures.selectedEdit.edge : ""
        z: TimelineMetrics.trimHandleLayer
        visible: edge !== ""
        x: edge === "end" ? parent.width - width : 0
        width: Ui.Metrics.xs
        height: parent.height
        color: Ui.Theme.accentPrimary
    }
    // The trim grips (TRIM_HANDLE_WIDTH_PX), over the body.
    MouseArea {
        id: startArea
        objectName: "clipTrimStart"
        z: TimelineMetrics.trimHandleLayer
        visible: clipItem.trimHandles
        width: 8
        height: parent.height
        acceptedButtons: clipItem.interactionLocked ? Qt.LeftButton : Qt.LeftButton | Qt.RightButton
        hoverEnabled: true
        cursorShape: clipItem.cursorFor("start", pressed, this)
        onEntered: clipItem.updateToolPreview("start", this, 0)
        onPositionChanged: mouse => clipItem.updateToolPreview("start", this, mouse.modifiers)
        onExited: if (clipItem.gestures) clipItem.gestures.clearToolHover(clipItem.clipId)
        onPressed: mouse => {
            if (mouse.button === Qt.RightButton) clipItem.editPointMenuRequested(clipItem.clipId, "start", this, mouse.x, mouse.y)
            else clipItem.press("start", mouse, this)
        }
    }
    MouseArea {
        id: endArea
        objectName: "clipTrimEnd"
        z: TimelineMetrics.trimHandleLayer
        visible: clipItem.trimHandles
        x: parent.width - width
        width: 8
        height: parent.height
        acceptedButtons: clipItem.interactionLocked ? Qt.LeftButton : Qt.LeftButton | Qt.RightButton
        hoverEnabled: true
        cursorShape: clipItem.cursorFor("end", pressed, this)
        onEntered: clipItem.updateToolPreview("end", this, 0)
        onPositionChanged: mouse => clipItem.updateToolPreview("end", this, mouse.modifiers)
        onExited: if (clipItem.gestures) clipItem.gestures.clearToolHover(clipItem.clipId)
        onPressed: mouse => {
            if (mouse.button === Qt.RightButton) clipItem.editPointMenuRequested(clipItem.clipId, "end", this, mouse.x, mouse.y)
            else clipItem.press("end", mouse, this)
        }
    }
}

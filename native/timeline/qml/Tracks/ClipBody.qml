// Mirrors web/src/components/timeline/Tracks/ClipBody.tsx: the drawn clip.
// A rounded paper block with the media-type tint and border, the header strip
// (type dot, name, duration), the fade ramps, the incoming transition wedge,
// the trim grips and the lock badge, and the clip pictures (M2b): the
// filmstrip of a video, the picture of an image, the waveform of an audio
// clip. Clip passes the values and edit context into its child controls. The
// status layer is not drawn yet.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Shapes
import QtQuick.Controls
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

Item {
    id: body
    property string clipId
    property double startMs: 0
    property string labelColor
    property double speedMultiplier: 1
    property bool speedBaked
    property bool hasAnimations
    property bool hasTimeRemap
    property string audioRole
    property string status
    property string takeBadge
    property string activeTakeLabel
    property bool hasActiveTake
    property bool activeTakeDrifting
    property TimelineModel timeline: null
    property ClipGestureController gestures: null
    property string name
    property string mediaType: "video"
    property double durationMs: 0
    property double msPerPx: 10
    property bool hovered: false
    property bool selected: false
    property bool disabled: false
    property bool locked: false
    property double fadeInMs: 0
    property double fadeOutMs: 0
    property string fadeInShape: "linear"
    property string fadeOutShape: "linear"
    property string transitionType
    property double transitionMs: 0
    // The local media file, the source in-point and the source out-point.
    property string mediaSource
    property double inPointMs: 0
    property double sourceOutMs: 0
    property double loopLengthMs: 0
    readonly property double repeatLengthMs: loopLengthMs > 0 && loopLengthMs < durationMs ? loopLengthMs : 0
    readonly property double sourceRate: speedBaked ? 1 : Math.max(0.0001, speedMultiplier)
    // The body's x in the lanes content and the view: the pictures draw only
    // the part near the viewport.
    property double contentX: 0
    property TimelineViewState viewState: null
    // The part of the body inside the lanes viewport, in body coordinates.
    // Only the transition stripes read it.
    property double visibleFromPx: 0
    property double visibleToPx: width

    property bool laneInViewport: true
    readonly property bool inViewport: laneInViewport && visible && clipId !== "" && (!viewState ||
        (contentX + width > viewState.scrollLeftPx && contentX < viewState.scrollLeftPx + viewState.viewportWidthPx))
    property bool detailGestureActive: false
    property bool detailFocusActive: false
    property bool detailMenuActive: false
    property bool resettingParts: false
    readonly property bool interactiveDetails: visible && clipId !== "" && (hovered || selected || detailGestureActive || detailFocusActive || detailMenuActive)
    onClipIdChanged: {
        resettingParts = true
        detailGestureActive = false
        detailFocusActive = false
        detailMenuActive = false
        Qt.callLater(body.finishReset)
    }
    function finishReset(): void { resettingParts = false }

    readonly property color accent: TimelineVisuals.clipAccent(mediaType)
    // The clip's colour label: a CSS colour, or empty.
    readonly property string clipLabel: labelColor
    readonly property int radius: 1
    readonly property color baseColor: clipLabel !== "" ? clipLabel : TimelineVisuals.clipFill(mediaType)
    // The muted name band; the body under it is a darker tint.
    readonly property color fill: TimelineVisuals.regionBand(baseColor)
    readonly property color bodyFill: TimelineVisuals.regionBody(baseColor)
    property bool hasEffects: false
    // COMPACT_THRESHOLD_PX, MIN_TRIM_HANDLE_CLIP_WIDTH_PX (8 * 2 + 12)
    readonly property bool showDuration: width >= 96
    readonly property bool showTrimHandles: width >= 28
    readonly property bool showFades: mediaType === "audio" || mediaType === "video" || mediaType === "midi"

    readonly property real fadeGripSize: 9
    readonly property real fadeGripMargin: 6
    function fadeGripCenter(edge: string): real {
        const offset = Math.min((edge === "in" ? fadeInMs : fadeOutMs) / msPerPx, width)
        return Math.min(Math.max(edge === "in" ? offset : width - offset, fadeGripSize / 2), width - fadeGripSize / 2)
    }

    // resolveClipFades over the on-screen duration, then the ramp widths of
    // deriveClipFadeMarkers (capped to the clip, dropped under 2 px).
    readonly property double spanMs: width * msPerPx
    readonly property double cappedFadeInMs: Math.min(spanMs, Math.max(0, fadeInMs))
    readonly property double cappedFadeOutMs: Math.min(spanMs, Math.max(0, fadeOutMs))
    readonly property bool overlappingFades: cappedFadeInMs + cappedFadeOutMs > spanMs
    readonly property double fadeInPx: Math.min(width,
        (overlappingFades ? Math.min(cappedFadeInMs, spanMs / 2) : cappedFadeInMs) / msPerPx)
    readonly property double fadeOutPx: Math.min(width,
        (overlappingFades ? Math.min(cappedFadeOutMs, spanMs / 2) : cappedFadeOutMs) / msPerPx)
    readonly property double transitionPx: Math.min(width, Math.max(0, transitionMs / msPerPx))

    opacity: disabled ? 0.4 : 1     // DISABLED_CLIP_OPACITY

    // The solid label fill, lighter when selected.
    Rectangle {
        objectName: "clipTint"
        anchors.fill: parent
        radius: body.radius
        color: body.selected ? Qt.lighter(body.bodyFill, 1.18) : body.bodyFill
        Rectangle {
            objectName: "clipBand"
            width: parent.width
            height: TimelineMetrics.clipNameBandHeight
            radius: body.radius
            color: body.selected ? Qt.lighter(body.fill, 1.18) : body.fill
        }
    }

    // Pictures and audio are mutually exclusive, so share their loader.
    Loader {
        readonly property bool audio: body.mediaType === "audio"
        active: !body.resettingParts && body.inViewport && body.mediaSource !== ""
            && (audio || body.mediaType === "video" || body.mediaType === "overlay" || body.mediaType === "image")
        x: audio ? 0 : 1
        y: headerRow.height
        width: Math.max(0, body.width - (audio ? 0 : 2))
        height: Math.max(0, body.height - headerRow.height - (audio ? 0 : 1))
        sourceComponent: audio ? waveformComponent : pictureComponent
    }
    Component {
        id: pictureComponent
        FilmstripItem {
            objectName: "filmstrip"
            source: body.mediaSource
            kind: body.mediaType === "image" ? "image" : "video"
            inPointMs: body.inPointMs
            outPointMs: body.sourceOutMs
            clipWidthPx: body.width
            stripeColor: Ui.Theme.actionPressed
            contentX: body.contentX + 1
            viewState: body.viewState
        }
    }
    Component {
        id: waveformComponent
        WaveformItem {
            objectName: "waveform"
            source: body.mediaSource
            inPointMs: body.inPointMs
            outPointMs: body.inPointMs + body.durationMs * (body.repeatLengthMs > 0 ? body.sourceRate : 1)
            repeatSourceMs: body.repeatLengthMs * body.sourceRate
            color: TimelineVisuals.regionContent(body.baseColor)
            contentX: body.contentX
            viewState: body.viewState
        }
    }

    Loader {
        active: !body.resettingParts && body.mediaType === "group"
        anchors.fill: parent
        sourceComponent: Item {
            GroupBracket {
                id: groupBracket
                objectName: "groupBracket-" + clipId
                clipId: body.clipId
                startMs: body.startMs
                durationMs: body.durationMs
                widthPx: body.width
                // JSON data from the document, controller, or shared JavaScript API.
                property var span: body.gestures ? body.gestures.groupSpan(clipId) : ({})
                spanStartMs: span.startMs ?? NaN
                spanEndMs: span.endMs ?? NaN
                Connections {
                    target: body.timeline
                    function onClipsChanged() { groupBracket.span = body.gestures.groupSpan(groupBracket.clipId) }
                }
            }
        }
    }

    Loader {
        active: !body.resettingParts && body.hasAnimations
        anchors.fill: parent
        z: TimelineMetrics.clipOverlayLayer
        sourceComponent: Item {
            ClipInspectorController {
                id: keyframeEdits
                timeline: body.timeline
                clock: body.gestures ? body.gestures.clock : null
                clipId: body.clipId
            }
            KeyframeClipDiamonds {
                id: keyframeDiamonds
                function playheadPassthrough(point) {
                    return keyframeDiamonds.childAt(point.x, point.y) !== null
                }
                anchors.fill: parent
                clipId: body.clipId
                durationMs: body.durationMs
                msPerPx: body.msPerPx
                timesMs: keyframeEdits.hasAnimations ? keyframeEdits.rowState("").times : []
                locked: body.locked
                formatTime: ms => TimelineFormat.clipDuration(ms)
                onSeek: relativeMs => keyframeEdits.seek(relativeMs)
                onMove: (fromMs, toMs) => {
                    const frameMs = 1000 / Math.max(1, body.timeline.fps)
                    const startMs = body.startMs
                    const absoluteMs = Math.round((startMs + toMs) / frameMs) * frameMs
                    const relativeMs = Math.max(0, Math.min(body.durationMs, absoluteMs - startMs))
                    keyframeEdits.write({action: "move", fromMs, toMs: relativeMs})
                    keyframeEdits.seek(relativeMs)
                }
            }
        }
    }

    // Fade ramps: the shaded part is the signal the fade removes.
    // Loaders: most clips have no fade, transition or lock, and the delegate
    // is created on every scroll that brings a clip into the window.
    Loader {
        active: !body.resettingParts && body.showFades && body.fadeInPx >= 2
        width: body.fadeInPx
        height: body.height
        sourceComponent: FadeRamp {
            edge: "in"
            shape: body.fadeInShape
        }
    }
    Loader {
        active: !body.resettingParts && body.showFades && body.fadeOutPx >= 2
        x: body.width - width
        width: body.fadeOutPx
        height: body.height
        sourceComponent: FadeRamp {
            edge: "out"
            shape: body.fadeOutShape
        }
    }

    Loader {
        id: repeatLoader
        active: !body.resettingParts && body.repeatLengthMs > 0
        x: active ? Math.max(0, (body.viewState ? body.viewState.scrollLeftPx : 0) - body.contentX) : 0
        width: active ? Math.max(0, Math.min(body.width - x, body.viewState ? body.viewState.viewportWidthPx : body.width)) : 0
        height: body.height
        sourceComponent: Canvas {
            id: repeats
            objectName: "musicLoopRepeats-" + body.clipId
            visible: body.repeatLengthMs > 0
            readonly property double periodPx: body.repeatLengthMs / body.msPerPx
            readonly property color repeatFill: Qt.alpha(TimelineVisuals.loopRepeatFill, 0.34)
            readonly property color notchInk: TimelineVisuals.clipText
            readonly property color seamInk: Qt.alpha(TimelineVisuals.clipText, 0.45)
            anchors.fill: parent
            readonly property real offset: repeatLoader.x
            onOffsetChanged: requestPaint()
            onWidthChanged: requestPaint()
            onHeightChanged: requestPaint()
            onPeriodPxChanged: requestPaint()
            onRepeatFillChanged: requestPaint()
            onNotchInkChanged: requestPaint()
            onVisibleChanged: requestPaint()
            onPaint: {
                const ctx = getContext("2d")
                ctx.clearRect(0, 0, width, height)
                if (!(periodPx > 0) || !visible) return
                // The repeats keep the clip colour, shaded so the source period reads as the original.
                ctx.fillStyle = repeatFill
                const firstDim = Math.min(width, Math.max(0, periodPx - offset))
                ctx.fillRect(firstDim, 0, width - firstDim, height)
                const stride = Math.max(1, Math.ceil(Ui.Metrics.xs / periodPx))
                for (let repeat = Math.max(1, Math.floor(offset / periodPx)); repeat * periodPx < offset + width; repeat += stride) {
                    const at = repeat * periodPx - offset
                    // A full-height seam at every repeat, with the notch on top.
                    ctx.fillStyle = seamInk
                    ctx.fillRect(Math.round(at), 0, Ui.Metrics.border, height)
                    ctx.fillStyle = notchInk
                    ctx.beginPath()
                    ctx.moveTo(at - Ui.Metrics.xs, 0)
                    ctx.lineTo(at, Ui.Metrics.sm)
                    ctx.lineTo(at + Ui.Metrics.xs, 0)
                    ctx.closePath()
                    ctx.fill()
                }
            }
        }
    }

    // The incoming transition: a hatched wedge with an accent edge.
    Loader {
        active: !body.resettingParts && body.transitionType !== "" && body.transitionPx >= 2
        width: body.transitionPx
        height: body.height
        sourceComponent: transitionWedge
    }
    Component {
        id: transitionWedge
        Item {
            id: wedge
            objectName: "transitionWedge"
            readonly property double step: 6 * Math.SQRT2
            // repeating-linear-gradient(135deg, tint 0 2px, transparent 2px 6px):
            // "/" stripes 6 px apart along the 135deg axis. Stripe n runs from
            // (n * step - h, h) to (n * step, 0); only the stripes that cross
            // the visible part of the wedge are drawn, so a long transition at
            // a fine zoom costs no more than one viewport of stripes.
            readonly property double fromPx: Math.max(0, body.visibleFromPx)
            readonly property double toPx: Math.min(body.transitionPx, body.visibleToPx)
            readonly property int firstStripe: Math.floor(fromPx / step)
            readonly property int stripeCount: toPx < fromPx ? 0
                : Math.floor((toPx + body.height) / step) - firstStripe + 1
            readonly property double firstStripeX: firstStripe * step - body.height
            clip: true
            Shape {
                anchors.fill: parent
                preferredRendererType: Shape.CurveRenderer
                ShapePath {
                    strokeColor: TimelineVisuals.clipBorderTint(body.mediaType)
                    strokeWidth: 2
                    fillColor: "transparent"
                    capStyle: ShapePath.FlatCap
                    PathSvg {
                        path: {
                            const h = body.height
                            let d = ""
                            for (let i = 0; i < wedge.stripeCount; ++i) {
                                const x0 = wedge.firstStripeX + i * wedge.step
                                d += "M" + x0 + " " + h + " L" + (x0 + h) + " 0 "
                            }
                            return d
                        }
                    }
                }
            }
            Rectangle {
                anchors.right: parent.right
                width: 1
                height: parent.height
                color: body.accent
            }
            function cancelTransition(): void {
                transitionGrip.ownerClipId = ""
                transitionEdits.cancelGesture()
                body.detailGestureActive = false
            }
            Component.onDestruction: cancelTransition()
            Connections {
                target: body
                function onClipIdChanged(): void { wedge.cancelTransition() }
            }
            TransitionController { id: transitionEdits; model: body.timeline }
            MouseArea {
                id: transitionGrip
                objectName: "clip-transition-handle-" + (body.clipId)
                readonly property string label: "Transition length"
                property real startX: 0
                property real startMs: 0
                property real wantedMs: 0
                property string ownerClipId: ""
                x: parent.width - width + 3
                width: 8
                height: parent.height
                z: TimelineMetrics.clipOverlayLayer
                enabled: !body.locked
                preventStealing: true
                hoverEnabled: true
                cursorShape: Qt.SizeHorCursor
                Accessible.role: Accessible.Slider
                Accessible.name: label
                Ui.Tooltip { trigger: transitionGrip; visible: transitionGrip.containsMouse && !transitionGrip.pressed; text: transitionGrip.label }
                onPressed: mouse => {
                    ownerClipId = body.clipId
                    body.detailGestureActive = true
                    startX = mapToItem(body, mouse.x, mouse.y).x
                    startMs = body.transitionMs
                    wantedMs = startMs
                    transitionEdits.beginGesture("setTransitionDuration", {clipId: body.clipId, durationMs: startMs})
                }
                onPositionChanged: mouse => {
                    if (!pressed || ownerClipId !== body.clipId) return
                    const dx = mapToItem(body, mouse.x, mouse.y).x - startX
                    wantedMs = Math.max(Math.round(1000 / Math.max(1, body.timeline.fps)), Math.round(startMs + dx * body.msPerPx))
                    transitionEdits.preview({durationMs: wantedMs})
                }
                onReleased: {
                    if (ownerClipId !== "" && ownerClipId === body.clipId) {
                        transitionEdits.commit("setTransitionDuration", {durationMs: wantedMs})
                    }
                    ownerClipId = ""
                    body.detailGestureActive = false
                }
                onCanceled: {
                    wedge.cancelTransition()
                }
            }
            Ui.Text {
                visible: body.transitionPx >= 48       // TRANSITION_LABEL_MIN_PX
                x: Ui.Metrics.sm
                anchors.bottom: parent.bottom
                anchors.bottomMargin: Ui.Metrics.xs
                text: body.transitionType
                role: Ui.Typography.MonoCaption
                tone: Ui.Text.Secondary
            }
        }
    }

    // Name band: the fx badge, the name, the duration. 16 px, dark text on the fill.
    Item {
        id: headerRow
        width: parent.width
        height: TimelineMetrics.clipNameBandHeight
        clip: true
        Rectangle {
            id: dot
            objectName: "clipFxBadge"
            visible: body.hasEffects
            x: Ui.Metrics.xs
            anchors.verticalCenter: parent.verticalCenter
            width: fxText.implicitWidth + 2 * Ui.Metrics.micro
            height: 11
            radius: 1
            color: TimelineVisuals.fxBadge
            border.width: 1
            border.color: TimelineVisuals.overlayContrast
            Ui.Text {
                id: fxText
                anchors.centerIn: parent
                text: "fx"
                role: Ui.Typography.MonoCaption
                domainColor: TimelineVisuals.overlayContrast
            }
        }
        Ui.Text {
            id: nameText
            x: dot.visible ? dot.x + dot.width + Ui.Metrics.xs : Ui.Metrics.xs
            anchors.verticalCenter: parent.verticalCenter
            width: Math.max(0, (body.showDuration ? durationText.x - Ui.Metrics.sm : headerRow.width - Ui.Metrics.md) - x)
            text: body.name
            role: Ui.Typography.SansCaption
            domainColor: TimelineVisuals.clipText
            elide: Text.ElideRight
        }
        Ui.Text {
            id: durationText
            visible: body.showDuration
            x: headerRow.width - Ui.Metrics.sm - implicitWidth
            anchors.verticalCenter: parent.verticalCenter
            text: TimelineFormat.clipDuration(body.durationMs)
            role: Ui.Typography.MonoCaption
            domainColor: Qt.alpha(TimelineVisuals.clipText, 0.7)
        }
    }

    // Trim grips: hidden until the clip is hovered or selected.
    Repeater {
        model: body.showTrimHandles && body.interactiveDetails ? 2 : 0
        delegate: Rectangle {
            required property int index
            x: index === 0 ? 0 : body.width - width
            width: 8                                     // TRIM_HANDLE_WIDTH_PX
            height: body.height
            color: Qt.alpha(TimelineVisuals.clipText, 0.3)
            opacity: body.selected || body.hovered ? 1 : 0
        }
    }

    Loader {
        active: !body.resettingParts && body.locked
        x: Ui.Metrics.md
        y: body.height - 4 - Ui.Metrics.iconXs
        sourceComponent: Ui.Icon {
            name: "lock"
            size: Ui.Metrics.iconXs
            domainColor: TimelineVisuals.clipText
            opacity: 0.85
        }
    }

    // Keep plugin contributions, but instantiate built-in panels only when
    // their presentation can be used. A closed/irrelevant panel owns no items.
    Item {
        property string slot: "clipBody"
        anchors.fill: parent
        Repeater {
            model: PanelRegistry.forSlot("clipBody")
            delegate: Loader {
                id: panel
                required property var modelData
                anchors.fill: parent
                active: !body.resettingParts && body.clipId !== "" && body.panelNeeded(modelData.id)
                property bool ready: false
                function loadPanel(): void {
                    if (!ready || !active) { return }
                    const properties = {
                        timeline: Qt.binding(() => body.timeline),
                        gestures: Qt.binding(() => body.gestures), viewState: Qt.binding(() => body.viewState)
                    }
                    if (modelData.id === "clipFadeGrips") { properties.body = body }
                    else { properties.clip = body }
                    setSource(modelData.source, properties)
                }
                onActiveChanged: {
                    if (active) { loadPanel() }
                    else { source = "" }
                }
                Component.onCompleted: { ready = true; loadPanel() }
            }
        }
    }
    function panelNeeded(id: string): bool {
        if (!visible || clipId === "") { return false }
        switch (id) {
        case "clipFadeGrips": return showFades && interactiveDetails
        case "takeBadge": return takeBadge !== "" && audioRole !== "music"
        case "midiNoteLines": return mediaType === "midi" && inViewport
        case "musicClipJob": return audioRole === "music" || status === "queued"
        case "trimEditMarks": return !!gestures && !!gestures.trimMode
            && gestures.trimMode.marks[clipId] !== undefined
        default: return true
        }
    }

    // The border on top: 1 px darker fill, or 1.5 px white when selected.
    Rectangle {
        anchors.fill: parent
        radius: body.radius
        color: "transparent"
        border.width: body.selected ? 1.5 : 1
        border.color: body.selected ? Ui.Theme.textPrimary : Qt.darker(body.fill, 1.6)
    }
}

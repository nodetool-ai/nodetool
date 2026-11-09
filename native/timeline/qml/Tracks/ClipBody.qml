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
    property var clipData: ({})
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
    // The body's x in the lanes content and the view: the pictures draw only
    // the part near the viewport.
    property double contentX: 0
    property TimelineViewState viewState: null
    // The part of the body inside the lanes viewport, in body coordinates.
    // Only the transition stripes read it.
    property double visibleFromPx: 0
    property double visibleToPx: width

    readonly property color accent: TimelineVisuals.clipAccent(mediaType)
    // The clip's colour label: a CSS colour, or empty.
    readonly property string clipLabel: clipData.labelColor ?? ""
    readonly property int radius: 1
    readonly property color fill: clipLabel !== "" ? clipLabel : TimelineVisuals.clipFill(mediaType)
    readonly property bool hasEffects: (clipData.effects || []).length > 0
    // COMPACT_THRESHOLD_PX, MIN_TRIM_HANDLE_CLIP_WIDTH_PX (8 * 2 + 12)
    readonly property bool showDuration: width >= 96
    readonly property bool showTrimHandles: width >= 28
    readonly property bool showFades: mediaType === "audio" || mediaType === "video" || mediaType === "midi"

    // resolveClipFades over the on-screen duration, then the ramp widths of
    // deriveClipFadeMarkers (capped to the clip, dropped under 2 px).
    readonly property double spanMs: width * msPerPx
    readonly property var resolvedFades: {
        const cap = ms => Math.min(spanMs, Math.max(0, ms))
        let fin = cap(fadeInMs)
        let fout = cap(fadeOutMs)
        if (fin + fout > spanMs) {
            fin = Math.min(fin, spanMs / 2)
            fout = Math.min(fout, spanMs / 2)
        }
        return { fadeIn: fin, fadeOut: fout }
    }
    readonly property double fadeInPx: Math.min(width, resolvedFades.fadeIn / msPerPx)
    readonly property double fadeOutPx: Math.min(width, resolvedFades.fadeOut / msPerPx)
    readonly property double transitionPx: Math.min(width, Math.max(0, transitionMs / msPerPx))

    opacity: disabled ? 0.4 : 1     // DISABLED_CLIP_OPACITY

    // The solid label fill, lighter when selected.
    Rectangle {
        objectName: "clipTint"
        anchors.fill: parent
        radius: body.radius
        color: body.selected ? Qt.lighter(body.fill, 1.18) : body.fill
    }

    // The filmstrip (video) or the picture (image): edge to edge under the
    // 16 px name band.
    Loader {
        active: body.mediaSource !== "" && (body.mediaType === "video" || body.mediaType === "overlay"
                                            || body.mediaType === "image")
        x: 1
        y: headerRow.height
        width: Math.max(0, body.width - 2)
        height: Math.max(0, body.height - headerRow.height - 1)
        sourceComponent: FilmstripItem {
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
    // The waveform under the name band, the clip's in-point plus its duration.
    Loader {
        active: body.mediaSource !== "" && body.mediaType === "audio"
        y: headerRow.height
        width: body.width
        height: Math.max(0, body.height - headerRow.height)
        sourceComponent: WaveformItem {
            objectName: "waveform"
            source: body.mediaSource
            inPointMs: body.inPointMs
            outPointMs: body.inPointMs + body.durationMs
            color: TimelineVisuals.audioWave
            contentX: body.contentX
            viewState: body.viewState
        }
    }

    Loader {
        active: body.mediaType === "group"
        anchors.fill: parent
        sourceComponent: Item {
            GroupBracket {
                id: groupBracket
                objectName: "groupBracket-" + clipId
                clipId: body.clipData.id ?? ""
                startMs: body.clipData.startMs ?? 0
                durationMs: body.durationMs
                widthPx: body.width
                property var span: body.gestures ? body.gestures.groupSpan(clipId) : ({})
                spanStartMs: span.startMs ?? null
                spanEndMs: span.endMs ?? null
                Connections {
                    target: body.timeline
                    function onClipsChanged() { groupBracket.span = body.gestures.groupSpan(groupBracket.clipId) }
                }
            }
        }
    }

    Loader {
        active: (body.clipData.animations || []).length > 0
        anchors.fill: parent
        z: TimelineMetrics.clipOverlayLayer
        sourceComponent: Item {
            ClipInspectorController {
                id: keyframeEdits
                timeline: body.timeline
                clock: body.gestures ? body.gestures.clock : null
                clipId: body.clipData.id ?? ""
            }
            KeyframeClipDiamonds {
                id: keyframeDiamonds
                function playheadPassthrough(point) {
                    return keyframeDiamonds.childAt(point.x, point.y) !== null
                }
                anchors.fill: parent
                clipId: body.clipData.id ?? ""
                durationMs: body.durationMs
                msPerPx: body.msPerPx
                timesMs: keyframeEdits.clip.animations ? keyframeEdits.rowState("").times : []
                locked: body.locked
                formatTime: ms => TimelineFormat.clipDuration(ms)
                onSeek: relativeMs => keyframeEdits.seek(relativeMs)
                onMove: (fromMs, toMs) => {
                    const frameMs = 1000 / Math.max(1, body.timeline.fps)
                    const startMs = body.clipData.startMs ?? 0
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
        active: body.showFades && body.fadeInPx >= 2
        width: body.fadeInPx
        height: body.height
        sourceComponent: FadeRamp {
            edge: "in"
            shape: body.fadeInShape
        }
    }
    Loader {
        active: body.showFades && body.fadeOutPx >= 2
        x: body.width - width
        width: body.fadeOutPx
        height: body.height
        sourceComponent: FadeRamp {
            edge: "out"
            shape: body.fadeOutShape
        }
    }

    // The incoming transition: a hatched wedge with an accent edge.
    Loader {
        active: body.transitionType !== "" && body.transitionPx >= 2
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
            TransitionController { id: transitionEdits; model: body.timeline }
            MouseArea {
                id: transitionGrip
                objectName: "clip-transition-handle-" + (body.clipData.id ?? "")
                readonly property string label: "Transition length"
                property real startX: 0
                property real startMs: 0
                property real wantedMs: 0
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
                    startX = mapToItem(body, mouse.x, mouse.y).x
                    startMs = body.transitionMs
                    wantedMs = startMs
                    transitionEdits.beginGesture("setTransitionDuration", {clipId: body.clipData.id, durationMs: startMs})
                }
                onPositionChanged: mouse => {
                    if (!pressed) return
                    const dx = mapToItem(body, mouse.x, mouse.y).x - startX
                    wantedMs = Math.max(Math.round(1000 / Math.max(1, body.timeline.fps)), Math.round(startMs + dx * body.msPerPx))
                    transitionEdits.preview({durationMs: wantedMs})
                }
                onReleased: transitionEdits.commit("setTransitionDuration", {durationMs: wantedMs})
                onCanceled: transitionEdits.cancelGesture()
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
        height: 16
        clip: true
        Rectangle {
            id: dot
            objectName: "clipFxBadge"
            x: Ui.Metrics.xs
            anchors.verticalCenter: parent.verticalCenter
            width: fxText.implicitWidth + 2 * Ui.Metrics.micro
            height: 11
            radius: 1
            color: body.hasEffects ? TimelineVisuals.fxBadge : "transparent"
            border.width: 1
            border.color: TimelineVisuals.clipText
            Ui.Text {
                id: fxText
                anchors.centerIn: parent
                text: "fx"
                role: Ui.Typography.MonoCaption
                domainColor: TimelineVisuals.clipText
            }
        }
        Ui.Text {
            id: nameText
            x: dot.x + dot.width + Ui.Metrics.xs
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
        model: body.showTrimHandles ? 2 : 0
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
        active: body.locked
        x: Ui.Metrics.md
        y: body.height - 4 - Ui.Metrics.iconXs
        sourceComponent: Ui.Icon {
            name: "lock"
            size: Ui.Metrics.iconXs
            domainColor: TimelineVisuals.clipText
            opacity: 0.85
        }
    }

    SlotItems {
        anchors.fill: parent
        slot: "clipBody"
        overlay: true
        slotProperties: ({ clip: body.clipData, timeline: body.timeline,
                           gestures: body.gestures, viewState: body.viewState })
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

// Mirrors web/src/components/timeline/Tracks/ClipBody.tsx: the drawn clip.
// A rounded paper block with the media-type tint and border, the header strip
// (type dot, name, duration), the fade ramps, the incoming transition wedge,
// the trim grips and the lock badge, and the clip pictures (M2b): the
// filmstrip of a video, the picture of an image, the waveform of an audio
// clip. Pure presentation: Clip passes every value in. The keyframe and
// status layers are not drawn yet.
pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Shapes
import NodeTool.Timeline

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

    readonly property color accent: Theme.clipAccent(mediaType)
    readonly property int radius: Theme.radiusMd
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

    // background.paper with the type tint over it.
    Rectangle {
        anchors.fill: parent
        radius: body.radius
        color: Theme.backgroundPaper
    }
    Rectangle {
        anchors.fill: parent
        radius: body.radius
        color: Theme.clipSurfaceTint(body.mediaType)
    }

    // The filmstrip (video) or the picture (image): inset 6 px, under the
    // 20 px header, rounded 2 px.
    Loader {
        active: body.mediaSource !== "" && (body.mediaType === "video" || body.mediaType === "overlay"
                                            || body.mediaType === "image")
        x: 6
        y: 20
        width: Math.max(0, body.width - 12)
        height: Math.max(0, body.height - 26)
        sourceComponent: FilmstripItem {
            objectName: "filmstrip"
            source: body.mediaSource
            kind: body.mediaType === "image" ? "image" : "video"
            inPointMs: body.inPointMs
            outPointMs: body.sourceOutMs
            clipWidthPx: body.width
            stripeColor: Theme.overlayStrong
            contentX: body.contentX + 6
            viewState: body.viewState
        }
    }
    // The waveform: the whole body, the clip's in-point plus its duration.
    Loader {
        active: body.mediaSource !== "" && body.mediaType === "audio"
        anchors.fill: parent
        sourceComponent: WaveformItem {
            objectName: "waveform"
            source: body.mediaSource
            inPointMs: body.inPointMs
            outPointMs: body.inPointMs + body.durationMs
            color: Theme.success
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
                    strokeColor: Theme.clipBorderTint(body.mediaType)
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
            Text {
                visible: body.transitionPx >= 48       // TRANSITION_LABEL_MIN_PX
                x: Theme.spacingSm
                anchors.bottom: parent.bottom
                anchors.bottomMargin: Theme.spacingXs
                text: body.transitionType
                color: Theme.textSecondary
                font.family: Theme.monoFamily
                font.pixelSize: Theme.fontSizeSmaller
                font.weight: Font.Medium
            }
        }
    }

    // Header strip: type dot, name, duration. 18 px, padding 0 8, gap 6.
    Item {
        id: headerRow
        width: parent.width
        height: 18
        clip: true
        Rectangle {
            id: dot
            x: Theme.spacingMd
            anchors.verticalCenter: parent.verticalCenter
            width: 6
            height: 6
            radius: 3
            color: body.accent
            border.width: 1
            border.color: Theme.scrim
        }
        Text {
            id: nameText
            x: dot.x + dot.width + Theme.spacingSm
            anchors.verticalCenter: parent.verticalCenter
            width: Math.max(0, (body.showDuration ? durationText.x - Theme.spacingSm : headerRow.width - Theme.spacingMd) - x)
            text: body.name
            color: Theme.textPrimary
            font.family: Theme.sansFamily
            font.pixelSize: Theme.fontSizeSmaller
            font.weight: Font.Medium
            font.letterSpacing: -0.005 * Theme.fontSizeSmaller
            elide: Text.ElideRight
        }
        Text {
            id: durationText
            visible: body.showDuration
            x: headerRow.width - Theme.spacingMd - implicitWidth
            anchors.verticalCenter: parent.verticalCenter
            text: TimelineFormat.clipDuration(body.durationMs)
            color: Theme.textSecondary
            font.family: Theme.monoFamily
            font.pixelSize: Theme.fontSizeSmaller
            font.weight: Font.Medium
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
            color: Theme.overlayStrong
            opacity: body.selected || body.hovered ? 1 : 0
        }
    }

    Loader {
        active: body.locked
        x: Theme.spacingMd
        y: body.height - 4 - Theme.iconXs
        sourceComponent: Icon {
            path: Icons.lock
            size: Theme.iconXs
            color: Theme.textPrimary
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

    // The border on top: 1 px tint, or 1.5 px secondary when selected.
    Rectangle {
        anchors.fill: parent
        radius: body.radius
        color: "transparent"
        border.width: body.selected ? 1.5 : 1
        border.color: body.selected ? Theme.secondary : Theme.clipBorderTint(body.mediaType)
    }
}

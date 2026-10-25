pragma Singleton
import QtQuick

// The web editor's dark theme tokens (web/src/components/themes/paletteDark.ts,
// ThemeNodetool.tsx, ui_primitives/tokens.ts and spacing.ts) and the sizes of
// the timeline components. Names follow the web: `backgroundDefault` is
// `palette.background.default`, `spacingSm` is `SPACING.sm` in px, and so on.
QtObject {
    id: theme

    // palette.background, palette.text, palette.divider, palette.action
    readonly property color backgroundDefault: "#08090A"
    readonly property color backgroundPaper: "#101113"
    readonly property color textPrimary: "#F7F8F8"
    readonly property color textSecondary: "#8A8F98"
    readonly property color textDisabled: Qt.rgba(247 / 255, 248 / 255, 248 / 255, 0.38)
    readonly property color divider: Qt.rgba(1, 1, 1, 0.08)
    readonly property color actionHover: Qt.rgba(1, 1, 1, 0.02)
    readonly property color actionSelected: Qt.rgba(1, 1, 1, 0.05)
    readonly property color actionDisabled: Qt.rgba(1, 1, 1, 0.3)
    // palette.primary / secondary / info / success / warning / error
    readonly property color primary: "#3d68a8"
    readonly property color secondary: "#E879F9"
    readonly property color secondaryContrast: "#0B1220"
    readonly property color info: "#22D3EE"
    readonly property color success: "#50FA7B"
    readonly property color warning: "#FFB86C"
    readonly property color warningLight: "#FFD591"
    readonly property color error: "#FF5555"
    // c_scrim*, c_overlay*
    readonly property color scrimSoft: Qt.rgba(0, 0, 0, 0.3)
    readonly property color scrim: Qt.rgba(0, 0, 0, 0.6)
    readonly property color overlay: Qt.rgba(1, 1, 1, 0.06)
    readonly property color overlayStrong: Qt.rgba(1, 1, 1, 0.15)

    // theme.rounded (BORDER_RADIUS)
    readonly property int radiusXs: 2
    readonly property int radiusSm: 4
    readonly property int radiusMd: 6
    readonly property int radiusLg: 8

    // SPACING_PX
    readonly property int spacingMicro: 2
    readonly property int spacingXs: 4
    readonly property int spacingSm: 6
    readonly property int spacingMd: 8
    readonly property int spacingLg: 12
    readonly property int spacingXl: 16

    // CONTROL.height.xs, ICON_SIZE
    readonly property int controlXs: 24
    readonly property int iconXs: 14
    readonly property int iconSm: 16

    // Font sizes (--fontSize*) and families (--fontFamily1, --fontFamily2).
    readonly property int fontSizeNormal: 15
    readonly property int fontSizeSmall: 13
    readonly property int fontSizeSmaller: 11
    readonly property string sansFamily: interRegular.status === FontLoader.Ready ? interRegular.font.family : "Helvetica Neue"
    readonly property string monoFamily: monoRegular.status === FontLoader.Ready ? monoRegular.font.family : "Menlo"

    // The files the web loads through @fontsource, latin subset.
    readonly property FontLoader interRegular: FontLoader { source: "../fonts/inter-latin-400-normal.woff2" }
    readonly property FontLoader interMedium: FontLoader { source: "../fonts/inter-latin-500-normal.woff2" }
    readonly property FontLoader interSemibold: FontLoader { source: "../fonts/inter-latin-600-normal.woff2" }
    readonly property FontLoader monoRegular: FontLoader { source: "../fonts/jetbrains-mono-latin-400-normal.woff2" }
    readonly property FontLoader monoMedium: FontLoader { source: "../fonts/jetbrains-mono-latin-500-normal.woff2" }
    readonly property FontLoader monoSemibold: FontLoader { source: "../fonts/jetbrains-mono-latin-600-normal.woff2" }

    // Timeline sizes.
    readonly property int toolbarHeight: 36             // TracksRegion TOOLBAR_HEIGHT_PX
    readonly property int rulerHeight: 28               // TimeRuler RULER_HEIGHT_PX
    readonly property int scrollbarHeight: 14           // TIMELINE_SCROLLBAR_HEIGHT_PX
    readonly property int trackHeaderWidth: 320         // DEFAULT_TRACK_HEADER_WIDTH_PX
    readonly property int trackHeight: 64               // DEFAULT_TRACK_HEIGHT_PX
    readonly property int transportHeight: 36           // PreviewArea control bar minHeight

    // trackVisuals.ts trackTypeAccent
    function trackAccent(type) {
        switch (type) {
        case "audio": return success
        case "overlay": return secondary
        case "subtitle": return warning
        case "midi": return primary
        case "chord": return warningLight
        default: return info
        }
    }

    // trackVisuals.ts trackTypeMeta: the index chip prefix and the glyph.
    function trackPrefix(type) {
        switch (type) {
        case "audio": return "A"
        case "overlay": return "O"
        case "subtitle": return "T"
        case "midi": return "M"
        case "chord": return "C"
        default: return "V"
        }
    }
    function trackIcon(type) {
        switch (type) {
        case "audio": return Icons.audiotrack
        case "overlay": return Icons.layers
        case "subtitle": return Icons.subtitles
        case "midi": return Icons.piano
        case "chord": return Icons.queueMusic
        default: return Icons.videocam
        }
    }

    // ClipBody accent: the header dot of a clip, by media type.
    function clipAccent(mediaType) {
        switch (mediaType) {
        case "audio": return success
        case "overlay": case "text": case "shape": case "group": return secondary
        case "midi": return primary
        case "adjustment": return warning
        default: return info
        }
    }
    // trackVisuals.ts clipSurfaceTint, drawn over background.paper.
    function clipSurfaceTint(mediaType) {
        switch (mediaType) {
        case "video": return Qt.rgba(34 / 255, 211 / 255, 238 / 255, 0.10)
        case "audio": return Qt.rgba(80 / 255, 250 / 255, 123 / 255, 0.08)
        case "image": return Qt.rgba(34 / 255, 211 / 255, 238 / 255, 0.08)
        case "overlay": return Qt.rgba(232 / 255, 121 / 255, 249 / 255, 0.10)
        case "midi": return Qt.rgba(167 / 255, 139 / 255, 250 / 255, 0.10)
        default: return Qt.rgba(1, 1, 1, 0.04)
        }
    }
    // trackVisuals.ts clipBorderTint
    function clipBorderTint(mediaType) {
        switch (mediaType) {
        case "video": case "image": return Qt.rgba(34 / 255, 211 / 255, 238 / 255, 0.35)
        case "audio": return Qt.rgba(80 / 255, 250 / 255, 123 / 255, 0.35)
        case "overlay": return Qt.rgba(232 / 255, 121 / 255, 249 / 255, 0.40)
        case "midi": return Qt.rgba(167 / 255, 139 / 255, 250 / 255, 0.40)
        default: return divider
        }
    }
}

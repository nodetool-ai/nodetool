pragma Singleton
import QtQuick
import NodeTool.UiPrimitives as Ui
QtObject {
    readonly property color overlay: "#e879f9"
    readonly property color overlayContrast: "#0b1220"
    readonly property color information: "#22d3ee"
    readonly property color audio: "#50fa7b"
    readonly property color warning: "#ffb86c"
    readonly property color chord: "#ffd591"
    // Edit points, as an editor expects them: a ripple red, a roll or a regular trim yellow.
    readonly property color trimRipple: "#e53e3e"
    readonly property color trimRoll: "#f2c43d"
    // The edit room: the playhead, the timecode and the track target and
    // source patch boxes share one blue.
    readonly property color editBlue: "#2d8ceb"
    readonly property color targetFill: "#1f5c9e"
    // The music range band (docs/MUSIC-MODE.md section 7): editBlue at 18%.
    readonly property color rangeFill: "#2e2d8ceb"
    // Clip text on the muted region band: light on the dark scheme, as the web regions.
    readonly property color clipText: Ui.Theme.dark ? Ui.Theme.textPrimary : "#141414"
    readonly property color audioWave: "#7cf2c4"
    readonly property color loopRepeatFill: Ui.Theme.scrimMedia
    readonly property color fxBadge: "#e8d44d"

    // The solid clip fill by media type, as the label colours of a
    // conventional NLE: violet video, teal audio.
    function clipFill(mediaType) {
        switch (mediaType) {
        case "video": case "image": return "#a39ae6"
        case "audio": return "#1d9c80"
        case "overlay": case "text": case "shape": case "group": return "#df8fd0"
        case "midi": return "#8ea9ec"
        case "adjustment": return "#e0b45c"
        default: return "#9a9aa6"
        }
    }

    // Region colours (web regionColors.ts): the hue kept, about half the
    // saturation, a fixed lightness, so neighbouring regions read as one palette.
    function regionBand(base) {
        const c = Qt.darker(base, 1)
        c.hslSaturation = Math.min(c.hslSaturation, 0.85) * (Ui.Theme.dark ? 0.5 : 0.55)
        c.hslLightness = Ui.Theme.dark ? 0.4 : 0.62
        return c
    }
    // The body under the band: the band toward the canvas.
    function regionBody(base) {
        return Qt.tint(regionBand(base), Qt.alpha(Ui.Theme.surfaceCanvas, Ui.Theme.dark ? 0.5 : 0.62))
    }
    // Note lines, curves and waveforms on the body.
    function regionContent(base) {
        return Qt.tint(regionBand(base), Qt.alpha(Ui.Theme.textPrimary, Ui.Theme.dark ? 0.72 : 0.6))
    }

    function trackAccent(type) {
        switch (type) {
        case "audio": return audio
        case "overlay": return overlay
        case "subtitle": return warning
        case "midi": return Ui.Theme.accentPrimary
        case "chord": return chord
        default: return information
        }
    }
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
    function trackIconName(type) {
        switch (type) {
        case "audio": return "audiotrack"
        case "overlay": return "layers"
        case "subtitle": return "subtitles"
        case "midi": return "piano"
        case "chord": return "queueMusic"
        default: return "videocam"
        }
    }
    function clipAccent(mediaType) {
        switch (mediaType) {
        case "audio": return audio
        case "overlay": case "text": case "shape": case "group": return overlay
        case "midi": return Ui.Theme.accentPrimary
        case "adjustment": return warning
        default: return information
        }
    }
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
    function clipBorderTint(mediaType) {
        switch (mediaType) {
        case "video": case "image": return Qt.rgba(34 / 255, 211 / 255, 238 / 255, 0.35)
        case "audio": return Qt.rgba(80 / 255, 250 / 255, 123 / 255, 0.35)
        case "overlay": return Qt.rgba(232 / 255, 121 / 255, 249 / 255, 0.40)
        case "midi": return Qt.rgba(167 / 255, 139 / 255, 250 / 255, 0.40)
        default: return Ui.Theme.borderSubtle
        }
    }
}

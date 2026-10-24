pragma Singleton
import QtQuick

// Dark editor palette and the sizes the React timeline uses
// (TRACK_HEADER_WIDTH_PX, RULER_HEIGHT_PX, DEFAULT_TRACK_HEIGHT_PX).
QtObject {
    readonly property color background: "#121214"
    readonly property color panel: "#1b1b1f"
    readonly property color lane: "#17171a"
    readonly property color laneAlt: "#1a1a1e"
    readonly property color divider: "#2a2a30"
    readonly property color text: "#e6e6ea"
    readonly property color textMuted: "#8b8b94"
    readonly property color playhead: "#ff5a4f"
    readonly property color videoClip: "#3f6fc9"
    readonly property color overlayClip: "#a24a9c"

    readonly property int trackHeaderWidth: 200
    readonly property int rulerHeight: 28
    readonly property int trackHeight: 64

    function clipColor(trackType) {
        return trackType === "overlay" ? overlayClip : videoClip
    }

    function timecode(ms, fps) {
        const totalFrames = Math.floor(ms * fps / 1000)
        const f = totalFrames % Math.round(fps)
        const s = Math.floor(ms / 1000)
        const pad = n => (n < 10 ? "0" : "") + n
        return pad(Math.floor(s / 60)) + ":" + pad(s % 60) + ":" + pad(f)
    }
}

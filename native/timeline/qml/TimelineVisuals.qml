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

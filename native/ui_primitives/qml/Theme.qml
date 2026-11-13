pragma Singleton
import QtQuick

QtObject {
    enum Scheme { Unknown, System, Dark, Light }
    enum Recipe { None, RunningIndicator, MediaReadabilityScrim }
    property int preference: Theme.System
    property int systemScheme: Theme.Unknown
    property real uiScale: 1
    property real textScale: 1
    property bool reducedMotion: false
    onPreferenceChanged: if (preference !== Theme.System && preference !== Theme.Dark && preference !== Theme.Light) { console.warn("Invalid theme preference"); preference = Theme.System }
    onSystemSchemeChanged: if (systemScheme !== Theme.Unknown && systemScheme !== Theme.Dark && systemScheme !== Theme.Light) { console.warn("Invalid system scheme"); systemScheme = Theme.Unknown }
    onUiScaleChanged: if (!Number.isFinite(uiScale) || uiScale <= 0) { console.warn("Invalid UI scale"); uiScale = 1 }
    onTextScaleChanged: if (!Number.isFinite(textScale) || textScale <= 0) { console.warn("Invalid text scale"); textScale = 1 }
    readonly property int effectiveScheme: preference === Theme.System
        ? (systemScheme === Theme.Light ? Theme.Light : Theme.Dark) : preference
    readonly property bool dark: effectiveScheme === Theme.Dark
    readonly property color surfaceCanvas: dark ? "#08090a" : "#f5f5f6"
    readonly property color surfacePanel: dark ? "#101113" : "#ffffff"
    readonly property color surfaceOverlay: dark ? "#17181b" : "#f2f2f4"
    readonly property color surfaceInput: dark ? "#17181a" : "#f9f9f9"
    readonly property color textPrimary: dark ? "#f7f8f8" : "#18181b"
    readonly property color textSecondary: dark ? "#8a8f98" : "#5b5b66"
    readonly property color textDisabled: dark ? "#686969" : "#a1a1aa"
    readonly property color textOnAccent: "#ffffff"
    readonly property color actionHover: dark ? Qt.rgba(1,1,1,0.02) : Qt.rgba(24/255,24/255,27/255,0.04)
    readonly property color actionPressed: dark ? Qt.rgba(1,1,1,0.08) : Qt.rgba(24/255,24/255,27/255,0.1)
    readonly property color actionSelected: dark ? Qt.rgba(1,1,1,0.05) : Qt.rgba(24/255,24/255,27/255,0.07)
    readonly property color actionDisabled: dark ? Qt.rgba(1,1,1,0.1) : Qt.rgba(24/255,24/255,27/255,0.08)
    readonly property color borderSubtle: dark ? "#232426" : "#e4e4e7"
    readonly property color borderControl: dark ? "#27292e" : "#dcdce1"
    readonly property color borderStrong: dark ? "#8a8f98" : "#5b5b66"
    readonly property color borderFocus: dark ? "#3d68a8" : "#2f62c4"
    readonly property color borderError: dark ? "#ff5555" : "#d92d20"
    readonly property color accentPrimary: dark ? "#3d68a8" : "#2f62c4"
    readonly property color destructivePrimary: dark ? "#c62828" : "#b42318"
    readonly property color destructiveHover: dark ? "#a32020" : "#912018"
    readonly property color accentHover: dark ? "#2a4d80" : "#244e9e"
    readonly property color accentOutline: dark ? "#803e68a7" : "#803062c3"
    readonly property color outlinedDisabledInk: dark ? "#4dffffff" : "#4d17171a"
    readonly property color outlinedDisabledOutline: dark ? "#1affffff" : "#141a1a1a"
    readonly property color accentSecondary: dark ? "#e879f9" : "#b13bcf"
    readonly property color statusWarningSurface: dark ? "#3d2b10" : "#fff1d6"
    readonly property color statusWarningOnSurface: dark ? "#ffd08a" : "#825100"
    readonly property color statusErrorSurface: dark ? "#441d21" : "#ffebeb"
    readonly property color statusErrorOnSurface: dark ? "#ffb3b3" : "#b42323"
    readonly property color statusSuccess: dark ? "#50fa7b" : "#16a34a"
    readonly property color statusWarning: dark ? "#ffb86c" : "#dc6803"
    readonly property color statusError: dark ? "#ff5555" : "#d92d20"
    readonly property color statusInfo: dark ? "#22d3ee" : "#0e7490"
    readonly property color scrimMedia: Qt.rgba(0,0,0,0.6)
    readonly property color scrimModal: Qt.rgba(0,0,0,0.6)
    // Node graph tokens. The node editor canvas, cards and media read these through its presentation map.
    // A graph token that equals a token above reuses it: chrome is surfaceCanvas, overlay is surfaceOverlay,
    // mediaScrim is scrimMedia and the disabled outline is fieldDisabled.
    readonly property color graphCanvas: dark ? "#08090a" : "#f6f6f8"
    readonly property color graphGrid: dark ? "#1f2126" : "#d9d9df"
    readonly property color graphNode: dark ? "#0d0e10" : "#ffffff"
    readonly property color graphPaper: dark ? "#101113" : "#fafafb"
    readonly property color graphReroutePaper: dark ? "#101113" : "#ffffff"
    readonly property color graphRerouteBorder: dark ? "#808590" : "#71717a"
    // The edge of a card inside a group, and the fill that replaces the card color (ARGB).
    readonly property color graphGroupHeader: dark ? "#2a2d33" : "#f5f5f6"
    readonly property color graphGroupFill: dark ? "#8c222222" : "#8ccccccc"
    readonly property color graphZoomedTitle: dark ? "#b4b7bd" : "#3f3f46"
    readonly property color graphPreviewSelected: dark ? "#d4d6db" : "#27272a"
    readonly property color graphOutputSelected: dark ? "#4adbf1" : "#398da4"
    readonly property color graphDivider: dark ? "#14ffffff" : "#e4e4e7"
    readonly property color graphShadow: dark ? "#4d000000" : "#22000000"
    readonly property color graphChecker: dark ? "#06ffffff" : "#061a1a1a"
    readonly property color graphOutline: dark ? "#803e68a7" : "#803062c3"
    readonly property color graphDisabledInk: dark ? "#4dffffff" : "#4d17171a"
    readonly property color fieldSurface: dark ? "#08ffffff" : "#062a2a2a"
    readonly property color fieldSurfaceFocus: dark ? "#0dffffff" : "#121c1c1c"
    readonly property color fieldSurfaceDisabled: dark ? "#1affffff" : "#141a1a1a"
    // Fixed in both schemes: the alpha surface behind an image, the scrim ink and strong scrim on media,
    // the comparison metadata ink, the subgraph accent and the control wire.
    readonly property color alphaSurfaceBase: "#1e1e1e"
    readonly property color alphaSurfaceChecker: "#2a2a2a"
    readonly property color mediaScrimInk: dark ? "#d4d6db" : "#27272a"
    readonly property color mediaScrimStrong: "#d9000000"
    readonly property color comparisonMetadataInk: "#ccffffff"
    readonly property color subgraphAccent: "#7c3aed"
    readonly property color projectAccent: dark ? "#67e8f9" : "#22a5c4"
    readonly property color graphControlWire: "#f59e0b"
}

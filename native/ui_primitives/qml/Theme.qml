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
}

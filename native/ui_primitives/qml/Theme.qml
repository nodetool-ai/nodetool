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
    readonly property color surfaceCanvas: dark ? "#08090a" : "#f7f8f8"
    readonly property color surfacePanel: dark ? "#101113" : "#ffffff"
    readonly property color surfaceOverlay: dark ? "#202226" : "#ffffff"
    readonly property color surfaceInput: dark ? "#191b1f" : "#f1f2f3"
    readonly property color textPrimary: dark ? "#f7f8f8" : "#17191c"
    readonly property color textSecondary: dark ? "#b5bac3" : "#535a64"
    readonly property color textDisabled: dark ? "#858b95" : "#777d85"
    readonly property color textOnAccent: "#ffffff"
    readonly property color actionHover: dark ? Qt.rgba(1,1,1,0.08) : Qt.rgba(0,0,0,0.06)
    readonly property color actionPressed: dark ? Qt.rgba(1,1,1,0.16) : Qt.rgba(0,0,0,0.12)
    readonly property color actionSelected: dark ? Qt.rgba(1,1,1,0.12) : Qt.rgba(0,0,0,0.09)
    readonly property color actionDisabled: dark ? Qt.rgba(1,1,1,0.04) : Qt.rgba(0,0,0,0.04)
    readonly property color borderSubtle: dark ? "#454a52" : "#c6cad0"
    readonly property color borderControl: dark ? "#747b85" : "#717883"
    readonly property color borderStrong: dark ? "#aeb5bf" : "#4e5661"
    readonly property color borderFocus: dark ? "#8ab4f8" : "#285bad"
    readonly property color borderError: dark ? "#ff8383" : "#b42323"
    readonly property color accentPrimary: dark ? "#3266af" : "#285bad"
    readonly property color destructivePrimary: "#a91f2a"
    readonly property color destructiveHover: "#861923"
    readonly property color accentHover: dark ? "#3267ae" : "#1d498e"
    readonly property color statusWarningSurface: dark ? "#3d2b10" : "#fff1d6"
    readonly property color statusWarningOnSurface: dark ? "#ffd08a" : "#825100"
    readonly property color statusErrorSurface: dark ? "#441d21" : "#ffebeb"
    readonly property color statusErrorOnSurface: dark ? "#ffb3b3" : "#b42323"
    readonly property color statusSuccess: dark ? "#80dca0" : "#16713d"
    readonly property color statusWarning: dark ? "#ffd08a" : "#825100"
    readonly property color statusError: dark ? "#ff8383" : "#b42323"
    readonly property color statusInfo: dark ? "#8ab4f8" : "#285bad"
    readonly property color scrimMedia: Qt.rgba(0,0,0,0.6)
    readonly property color scrimModal: Qt.rgba(0,0,0,0.6)
}

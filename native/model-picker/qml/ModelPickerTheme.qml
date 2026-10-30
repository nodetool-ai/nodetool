pragma Singleton
import QtQuick

QtObject {
    readonly property color paper: "#101113"
    readonly property color field: "#08090A"
    readonly property color text: "#F7F8F8"
    readonly property color muted: "#8A8F98"
    readonly property color divider: "#303137"
    readonly property color accent: "#3d68a8"
    readonly property color selected: Qt.rgba(1, 1, 1, 0.05)
    readonly property color hover: Qt.rgba(1, 1, 1, 0.02)
    readonly property color warning: "#FFB86C"
    readonly property int width: 640
    readonly property int height: 560
    readonly property int railWidth: 176
    readonly property int rowHeight: 40
    readonly property int narrowWidth: 520
    readonly property int margin: 8
    readonly property int spacing: 8
    readonly property int radius: 8
    readonly property int navRowHeight: 32
    readonly property int navChipHeight: 28
    readonly property int navRailGutter: 6
    readonly property int navInset: 8
    readonly property int navIconSize: 16
    readonly property int navChipIconSize: 14
    readonly property int navGap: 8
    readonly property int navFontSize: 13
    readonly property int eyebrowFontSize: 11
    readonly property int navFocusWidth: 2
}

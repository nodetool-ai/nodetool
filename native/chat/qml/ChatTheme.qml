pragma Singleton
import QtQuick

QtObject {
    readonly property color background: "#08090A"
    readonly property color paper: "#101113"
    readonly property color text: "#F7F8F8"
    readonly property color muted: "#8A8F98"
    readonly property color divider: Qt.rgba(1, 1, 1, 0.12)
    readonly property color selected: Qt.rgba(1, 1, 1, 0.08)
    readonly property color primary: "#3d68a8"
    readonly property color error: "#FF5555"
    // Web paletteDark, ThemeNodetool radii, and CHAT_COLUMN_MAX_WIDTH.
    readonly property color bubble: Qt.rgba(1, 1, 1, 0.15)
    readonly property color focus: "#3A3D44"
    readonly property int columnWidth: 800
    readonly property int xxl: 24
    readonly property int xxxl: 32
    readonly property int bubbleRadius: 8
    readonly property int cardRadius: 16
    readonly property int title: 18
    readonly property int xs: 4
    readonly property int sm: 6
    readonly property int md: 8
    readonly property int lg: 12
    readonly property int xl: 16
    readonly property int radius: 6
    readonly property int body: 15
    readonly property int label: 13
    readonly property int caption: 11
    readonly property int control: 36
    readonly property int sidebar: 240
    readonly property int narrow: 640
    readonly property string sans: interRegular.status === FontLoader.Ready ? interRegular.font.family : "sans-serif"
    readonly property string mono: monoRegular.status === FontLoader.Ready ? monoRegular.font.family : "monospace"
    readonly property FontLoader interRegular: FontLoader { source: "qrc:/qt/qml/NodeTool/Chat/fonts/inter-latin-400-normal.woff2" }
    readonly property FontLoader interMedium: FontLoader { source: "qrc:/qt/qml/NodeTool/Chat/fonts/inter-latin-500-normal.woff2" }
    readonly property FontLoader interSemibold: FontLoader { source: "qrc:/qt/qml/NodeTool/Chat/fonts/inter-latin-600-normal.woff2" }
    readonly property FontLoader monoRegular: FontLoader { source: "qrc:/qt/qml/NodeTool/Chat/fonts/jetbrains-mono-latin-400-normal.woff2" }
}

import QtQuick
import NodeTool.UiPrimitives as Ui

// Renders the shared Material path set that the canvas painter also draws.
Image {
    id: root
    property string name: ""
    property real size: Ui.Metrics.iconSm
    property color ink: Ui.Theme.textSecondary
    readonly property string pathData: TypeIcons.path(name)
    width: size; height: size
    sourceSize: Qt.size(Math.ceil(size * Screen.devicePixelRatio), Math.ceil(size * Screen.devicePixelRatio))
    source: pathData === "" ? "" : "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="rgb(' + Math.round(ink.r * 255) + ',' + Math.round(ink.g * 255) + ',' + Math.round(ink.b * 255) + ')" fill-opacity="' + ink.a + '" d="' + pathData + '"/></svg>')
    Accessible.ignored: true
}

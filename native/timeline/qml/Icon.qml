// A Material icon from Icons.qml, as the web's SvgIcon draws it: the path in
// its 24 x 24 box, filled, scaled to `size`. The SVG is rasterized once per
// icon, colour and size and shared through the pixmap cache, so a row of
// buttons costs a few textured quads.
import QtQuick
import NodeTool.Timeline

Image {
    id: icon
    property string path
    property color color: Theme.textSecondary
    property real size: Theme.iconSm

    width: size
    height: size
    // Rasterized at 2x, so it stays sharp on a Retina display.
    sourceSize: Qt.size(Math.ceil(size * 2), Math.ceil(size * 2))
    smooth: true
    source: path === "" ? "" : "data:image/svg+xml;utf8," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="rgb('
        + Math.round(color.r * 255) + ',' + Math.round(color.g * 255) + ',' + Math.round(color.b * 255)
        + ')" fill-opacity="' + color.a + '" d="' + path + '"/></svg>')
}

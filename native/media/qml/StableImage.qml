import QtQuick

// An image that does not flicker while its size changes. A resize decodes
// the image again only at 256 px steps that grow, and the loaded picture
// stays on screen while it decodes. `loaded` turns false only when the
// source changes, so hosts can fade in on the first load alone.
Image {
    id: root
    // Decode pixels for each item pixel; 2 covers Retina screens.
    property real decodeScale: 2
    property bool loaded: false
    property real decodeWidth: 0
    readonly property real wantedWidth: Math.ceil(width * decodeScale / 256) * 256
    onWantedWidthChanged: decodeWidth = Math.max(decodeWidth, wantedWidth)
    onSourceChanged: { loaded = false; decodeWidth = wantedWidth }
    onStatusChanged: if (status === Image.Ready) loaded = true
    asynchronous: true
    retainWhileLoading: true
    sourceSize: Qt.size(decodeWidth, width > 0 ? decodeWidth * height / width : 0)
}

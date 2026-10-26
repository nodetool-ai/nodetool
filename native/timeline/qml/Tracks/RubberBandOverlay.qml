import QtQuick
import NodeTool.Timeline

Rectangle {
    property var bandRect: null
    visible: bandRect !== null && bandRect !== undefined
    x: bandRect ? bandRect.left : 0
    y: bandRect ? bandRect.top : 0
    width: bandRect ? bandRect.width : 0
    height: bandRect ? bandRect.height : 0
    color: Qt.rgba(Theme.secondary.r, Theme.secondary.g, Theme.secondary.b, 0x22 / 255)
    border.width: 1
    border.color: Theme.secondary
    z: 20 // Z_INDEX.sticky
    Accessible.ignored: true
}

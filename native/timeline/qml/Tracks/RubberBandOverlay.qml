import QtQuick
import NodeTool.Timeline

Rectangle {
    property var bandRect: null
    visible: bandRect !== null && bandRect !== undefined
    x: bandRect ? bandRect.left : 0
    y: bandRect ? bandRect.top : 0
    width: bandRect ? bandRect.width : 0
    height: bandRect ? bandRect.height : 0
    color: Qt.rgba(TimelineVisuals.overlay.r, TimelineVisuals.overlay.g, TimelineVisuals.overlay.b, 0x22 / 255)
    border.width: 1
    border.color: TimelineVisuals.overlay
    z: 20 // Z_INDEX.sticky
    Accessible.ignored: true
}

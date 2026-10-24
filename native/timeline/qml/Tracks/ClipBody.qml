// Mirrors web/src/components/timeline/Tracks/ClipBody.tsx: the rendered clip,
// a rounded block with the clip name. Pure presentation: Clip passes every
// value in.
import QtQuick

Rectangle {
    id: body
    property string name
    property bool dimmed: false
    property color fillColor

    color: fillColor
    radius: 4
    opacity: dimmed ? 0.4 : 1.0
    border.width: 1
    border.color: Qt.lighter(fillColor, 1.3)
    clip: true

    Text {
        x: 8
        y: 6
        width: parent.width - 16
        text: body.name
        color: "white"
        font.pixelSize: 12
        font.weight: Font.Medium
        elide: Text.ElideRight
    }
}

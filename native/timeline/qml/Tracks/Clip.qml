// Mirrors web/src/components/timeline/Tracks/Clip.tsx: the clip's place in
// the lane. It owns geometry (and later the gestures) and passes the data to
// ClipBody, which only draws.
import QtQuick
import NodeTool.Timeline

Item {
    id: clipItem
    property string clipName
    property bool clipHidden: false
    property color color: Theme.videoClip

    ClipBody {
        anchors.fill: parent
        name: clipItem.clipName
        dimmed: clipItem.clipHidden
        fillColor: clipItem.color
    }
}

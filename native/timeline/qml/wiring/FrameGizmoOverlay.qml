pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.TimelinePlayer

TransformGizmoOverlay {
    required property TimelineModel timeline
    required property PlaybackClock clock
}

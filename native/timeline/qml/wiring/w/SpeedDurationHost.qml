pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

Item {
    id: host
    objectName: "speedDurationHost"
    readonly property TimelineModel timelineModel: {
        for (let item = parent; item; item = item.parent) {
            if (item.timeline !== undefined && item.timeline !== null) return item.timeline
        }
        return null
    }
    function openForSelection(ids) {
        if (!ids || ids.length === 0) return false
        dialog.clipIds = ids
        dialog.openForSelection()
        return true
    }
    SpeedController { id: speedController; model: host.timelineModel }
    SpeedDurationDialog { id: dialog; controller: speedController }
}

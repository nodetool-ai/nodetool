import QtQuick
import NodeTool.Timeline

Item {
    id: host
    objectName: "speedDurationHost"
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    function openForSelection(ids) {
        if (!ids || ids.length === 0) return false
        dialog.clipIds = ids
        dialog.openForSelection()
        return true
    }
    SpeedController { id: speedController; model: host.timelineModel }
    SpeedDurationDialog { id: dialog; controller: speedController }
}

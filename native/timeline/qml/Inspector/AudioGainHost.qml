import QtQuick
import NodeTool.Timeline

Item {
    id: host
    objectName: "audioGainHost"
    anchors.fill: parent
    property var timelineModel: typeof timeline !== "undefined" ? timeline : null
    function openForSelection(ids) {
        if (!ids || ids.length === 0) return false
        dialog.clipIds = ids
        dialog.open()
        return true
    }
    AudioGainDialog {
        id: dialog
        objectName: "audioGainDialog"
        timeline: host.timelineModel
    }
}

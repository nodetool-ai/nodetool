import QtQuick
import NodeTool.Timeline
Item {
    id: root
    required property string slot
    objectName: "panelSlot_" + slot
    readonly property bool vertical: slot === "left" || slot === "right"
    implicitWidth: vertical ? childrenRect.width : 0
    implicitHeight: slot === "bottom" ? childrenRect.height : 0
    Repeater {
        id: panels
        model: PanelRegistry.forSlot(root.slot)
        delegate: Loader {
            required property var modelData
            required property int index
            source: modelData.source
            anchors.fill: root.slot === "overlay" ? root : null
            x: root.vertical || root.slot === "overlay" ? 0 : previousEnd()
            y: root.vertical ? previousEnd() : 0
            function previousEnd() {
                if (index === 0) return 0
                const previous = panels.itemAt(index - 1)
                if (!previous) return 0
                return root.vertical ? previous.y + previous.height : previous.x + previous.width
            }
        }
    }
}

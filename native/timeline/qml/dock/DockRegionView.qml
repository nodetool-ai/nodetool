pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline

Item {
    id: root
    required property var dock
    required property string region
    readonly property var groups: dock.groups(region)
    readonly property bool horizontal: region === "viewport" || region === "bottom"
    readonly property real totalWeight: groups.reduce((sum, group) => sum + (group.weight || 1), 0)
    readonly property real length: Math.max(0, (horizontal ? width : height) - Theme.spacingSm * Math.max(0, groups.length - 1))
    function groupLength(index) { return totalWeight ? length * (groups[index].weight || 1) / totalWeight : 0 }
    function offset(index) {
        let result = 0
        for (let i = 0; i < index; ++i) result += groupLength(i) + Theme.spacingSm
        return result
    }
    objectName: "dockRegion_" + region
    onXChanged: dock.noteGeometry()
    onYChanged: dock.noteGeometry()
    Repeater {
        model: root.groups.length
        delegate: DockGroup {
            required property int index
            dock: root.dock
            region: root.region
            group: root.groups[index]
            x: root.horizontal ? root.offset(index) : 0
            y: root.horizontal ? 0 : root.offset(index)
            width: root.horizontal ? root.groupLength(index) : root.width
            height: root.horizontal ? root.height : root.groupLength(index)
        }
    }
    Repeater {
        model: Math.max(0, root.groups.length - 1)
        delegate: DockResizeHandle {
            objectName: "dockResizeGroups_" + root.region + "_" + index
            required property int index
            vertical: root.horizontal
            x: root.horizontal ? root.offset(index) + root.groupLength(index) : 0
            y: root.horizontal ? 0 : root.offset(index) + root.groupLength(index)
            width: root.horizontal ? Theme.spacingSm : root.width
            height: root.horizontal ? root.height : Theme.spacingSm
            label: "Resize timeline " + root.region + " panel groups"
            value: root.groupLength(index)
            minimum: Math.min(64, (value + root.groupLength(index + 1)) / 2)
            maximum: Math.max((value + root.groupLength(index + 1)) / 2, value + root.groupLength(index + 1) - 64)
            onResizeRequested: next => {
                const first = root.groups[index], second = root.groups[index + 1]
                const weight = (first.weight || 1) + (second.weight || 1)
                const combinedLength = root.groupLength(index) + root.groupLength(index + 1)
                const firstWeight = Math.max(0.05, Math.min(weight - 0.05, weight * next / Math.max(1, combinedLength)))
                const weights = ({})
                weights[first.id] = firstWeight
                weights[second.id] = weight - firstWeight
                root.dock.store.dispatch({type: "resizeGroups", region: root.region, weights})
            }
        }
    }
}

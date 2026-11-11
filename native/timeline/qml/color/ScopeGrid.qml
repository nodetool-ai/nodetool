pragma ComponentBehavior: Bound
import QtQuick
import NodeTool.Timeline
import NodeTool.UiPrimitives as Ui

// The scopes one controller computes, as tiles that share the space.
Grid {
    id: grid
    property var shown: []
    required property var controller
    spacing: Ui.Metrics.xs
    readonly property int count: shown.length
    // Two rows only once a row of four would make each scope narrow.
    columns: count === 4 && width < height * 2.4 ? 2 : Math.max(1, count)
    readonly property int rowCount: Math.ceil(count / columns)
    readonly property real tileWidth: (width - (columns - 1) * spacing) / columns
    readonly property real tileHeight: (height - (rowCount - 1) * spacing) / rowCount
    Repeater {
        model: grid.shown
        delegate: ScopeTile {
            required property string modelData
            width: grid.tileWidth
            height: grid.tileHeight
            kind: modelData
            controller: grid.controller
        }
    }
}

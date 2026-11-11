import QtQuick
import NodeTool.UiPrimitives as Ui

// Active for one motion after a grid changes its column count. Tiles with a
// GridGlide then move to their new cells. Scrolling and resize steps that
// keep the column count stay immediate. The first layout of new tiles does
// not glide: a change counts only after the grid held its tiles for a moment.
QtObject {
    id: root
    property int columns: 1
    property bool enabled: true
    property bool active: false
    property bool armed: false
    onEnabledChanged: { armed = false; if (enabled) arm.restart() }
    Component.onCompleted: if (enabled) arm.restart()
    onColumnsChanged: {
        if (!armed || !enabled || Ui.Theme.reducedMotion) return
        active = true
        end.restart()
    }
    readonly property Timer arm: Timer { interval: 2 * Ui.Metrics.motionNormal; onTriggered: root.armed = root.enabled }
    readonly property Timer end: Timer { interval: Ui.Metrics.motionNormal; onTriggered: root.active = false }
}

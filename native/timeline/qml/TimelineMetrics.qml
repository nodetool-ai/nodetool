pragma Singleton
import QtQuick
import NodeTool.UiPrimitives as Ui

// Editor-specific geometry and stacking. Track height belongs to the document.
QtObject {
    readonly property real toolbarHeight: 36 * Ui.Theme.uiScale
    readonly property real rulerHeight: 28 * Ui.Theme.uiScale
    readonly property real scrollbarHeight: 14 * Ui.Theme.uiScale
    readonly property real trackHeaderWidth: 320 * Ui.Theme.uiScale
    readonly property real trackHeaderMinWidth: 264 * Ui.Theme.uiScale
    readonly property real trackHeaderMaxWidth: 640 * Ui.Theme.uiScale
    readonly property real sourceViewerPreferredWidth: 360 * Ui.Theme.uiScale
    readonly property real trackHeight: 64
    readonly property real transportHeight: 36 * Ui.Theme.uiScale
    readonly property real transportDurationMinWidth: 640 * Ui.Theme.uiScale
    readonly property real monitorRulerThickness: 16 * Ui.Theme.uiScale
    readonly property real trimMarkStroke: 3 * Ui.Theme.uiScale
    readonly property real trimMarkArm: 6 * Ui.Theme.uiScale
    readonly property real trimMonitorGap: 16 * Ui.Theme.uiScale
    // The pointer travel that trims one frame in the Trim Monitor.
    readonly property real trimMonitorPxPerFrame: 6 * Ui.Theme.uiScale
    readonly property real documentBarHeight: 40 * Ui.Theme.uiScale
    readonly property real automationAddHeight: 40 * Ui.Theme.uiScale
    readonly property real compactDocumentBarWidth: 640 * Ui.Theme.uiScale
    readonly property real dockMenuWidth: 240 * Ui.Theme.uiScale
    readonly property real shortcutsDialogWidth: 900 * Ui.Theme.uiScale
    readonly property int clipOverlayLayer: 3
    readonly property int playheadLayer: 10
    readonly property int trimHandleLayer: 2
    readonly property int clipBodyLayer: 1
    readonly property int toolbarLayer: 5
    readonly property int dockDropLayer: 2
}

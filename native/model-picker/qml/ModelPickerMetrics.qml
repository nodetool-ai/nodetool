pragma Singleton
import QtQuick
import NodeTool.UiPrimitives as Ui

QtObject {
    readonly property real width: 640 * Ui.Theme.uiScale
    readonly property real height: 560 * Ui.Theme.uiScale
    readonly property real railWidth: 176 * Ui.Theme.uiScale
    readonly property real rowHeight: 40 * Ui.Theme.uiScale
    readonly property real narrowWidth: 520 * Ui.Theme.uiScale
}

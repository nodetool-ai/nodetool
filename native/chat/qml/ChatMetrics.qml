pragma Singleton
import QtQuick
import NodeTool.UiPrimitives as Ui

QtObject {
    readonly property real columnWidth: 800 * Ui.Theme.uiScale
    readonly property real sidebar: 240 * Ui.Theme.uiScale
    readonly property real narrow: 640 * Ui.Theme.uiScale
}

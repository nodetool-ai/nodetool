pragma Singleton
import QtQuick
import NodeTool.UiPrimitives as Ui

QtObject {
    readonly property real width: 640 * Ui.Theme.uiScale
    readonly property real height: 560 * Ui.Theme.uiScale
    readonly property real railWidth: 176 * Ui.Theme.uiScale
    readonly property real rowHeight: 40 * Ui.Theme.uiScale
    readonly property real narrowWidth: 520 * Ui.Theme.uiScale
    // SECTION_HEADER_HEIGHT and DOWNLOAD_ROW_HEIGHT in web ModelList.tsx, and
    // the 120 px minimal DownloadProgress.
    readonly property real sectionHeight: 36 * Ui.Theme.uiScale
    readonly property real downloadRowHeight: 48 * Ui.Theme.uiScale
    readonly property real progressWidth: 120 * Ui.Theme.uiScale
    readonly property real detailMaxWidth: 128 * Ui.Theme.uiScale
}

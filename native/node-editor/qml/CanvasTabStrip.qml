import QtQuick
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property DocumentTabs tabs
    implicitHeight: root.tabs.canvasStrips.length * Ui.Metrics.compact
    EditorRoles {
        id: roles
    }
    Column {
        id: childRows
        width: parent.width
        Repeater {
            model: root.tabs.canvasStrips
            delegate: Rectangle {
                required property var modelData
                readonly property int depth: modelData.depth
                objectName: "subgraph-strip-" + depth
                width: childRows.width
                height: Ui.Metrics.compact
                color: Ui.Theme.surfaceCanvas
                Rectangle {
                    anchors.bottom: parent.bottom
                    width: parent.width
                    height: Ui.Metrics.border
                    color: Ui.Theme.borderSubtle
                }
                Ui.DocumentTabStrip {
                    id: strip
                    anchors.fill: parent
                    tabs: modelData.entries.map(entry => ({title: entry.title, closable: !entry.host, accent: entry.host ? Ui.Theme.accentPrimary : roles.subgraphAccent}))
                    currentIndex: modelData.entries.findIndex(entry => entry.selected)
                    tabPadding: Ui.Metrics.md
                    closablePadding: Ui.Metrics.xs
                    plainPadding: Ui.Metrics.md
                    contentSpacing: Ui.Metrics.xs
                    unchosenInset: Ui.Metrics.border
                    indicatorEdge: Qt.TopEdge
                    selectedColor: Ui.Theme.surfacePanel
                    dividerColor: Ui.Theme.borderSubtle
                    closeIconSize: Ui.Typography.pixelSize(Ui.Typography.SansCaption)
                    closeIdleTone: Ui.Text.Secondary
                    objectNameFor: function (role, index) {
                        switch (role) {
                        case "activate": return "activate-canvas-" + depth + "-" + index;
                        case "close": return "close-canvas-" + depth + "-" + index;
                        case "title": return "canvas-label-" + depth + "-" + index;
                        case "indicator": return "canvas-selection";
                        }
                        return "";
                    }
                    onTabActivated: index => root.tabs.activateSurface(modelData.entries[index].surface)
                    onCloseRequested: index => root.tabs.closeSurface(modelData.entries[index].surface)
                }
            }
        }
    }
}

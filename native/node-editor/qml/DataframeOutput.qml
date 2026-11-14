import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property var modelData
    spacing: Ui.Metrics.xs
    property var columnWidths: []
    TextMetrics { id: measure; font: Ui.Typography.font(Ui.Typography.SansLabel) }
    function sizeColumns() {
        const columns = modelData.tableColumns || []
        const rows = modelData.tableRows || []
        const widths = []
        for (let c = 0; c < columns.length; ++c) {
            measure.text = String(columns[c])
            let size = measure.advanceWidth
            for (let r = 0; r < rows.length; ++r) {
                measure.text = String(rows[r].cells[c] || "")
                size = Math.max(size, measure.advanceWidth)
            }
            widths.push(Math.max(Ui.Metrics.touch * 2, Math.min(Ui.Metrics.dialogCompactWidth, size + Ui.Metrics.xl * 2)))
        }
        columnWidths = widths
    }
    onModelDataChanged: sizeColumns()
    Component.onCompleted: sizeColumns()
    Ui.EditorButton {
        id: expand
        objectName: "dataframe-expand"
        text: "Open full view"
        variant: Ui.EditorButton.Outlined; flat: true
        onClicked: full.open()
    }
    Component {
        id: tableComponent
        Column {
            id: table
            clip: true
            property real totalWidth: root.columnWidths.reduce((sum, value) => sum + value, 0)
            Row {
                id: header
                x: -rows.contentX
                Repeater {
                    model: root.modelData.tableColumns || []
                    Rectangle {
                        required property var modelData
                        required property int index
                        width: root.columnWidths[index] || Ui.Metrics.touch * 2
                        height: Ui.Metrics.standard
                        color: Ui.Theme.surfaceOverlay
                        border.color: Ui.Theme.borderSubtle
                        border.width: Ui.Metrics.border
                        Ui.Text {
                            anchors.fill: parent; anchors.margins: Ui.Metrics.sm
                            text: parent.modelData
                            role: Ui.Typography.SansLabel
                            verticalAlignment: Text.AlignVCenter
                            elide: Text.ElideRight
                        }
                        MouseArea {
                            anchors.right: parent.right; width: Ui.Metrics.md; height: parent.height
                            cursorShape: Qt.SplitHCursor
                            preventStealing: true
                            property real startX
                            property real startWidth
                            onPressed: mouse => { startX = mapToItem(table, mouse.x, mouse.y).x; startWidth = parent.width }
                            onPositionChanged: mouse => {
                                if (!pressed) return
                                const widths = root.columnWidths.slice()
                                widths[parent.index] = Math.max(Ui.Metrics.touch, startWidth + mapToItem(table, mouse.x, mouse.y).x - startX)
                                root.columnWidths = widths
                            }
                        }
                    }
                }
            }
            ListView {
                id: rows
                objectName: "output-dataframe"
                width: table.width
                height: Math.max(0, table.height - header.height)
                contentWidth: table.totalWidth
                flickableDirection: Flickable.AutoFlickDirection
                boundsBehavior: Flickable.StopAtBounds
                clip: true
                model: root.modelData.tableRows || []
                Basic.ScrollBar.horizontal: Ui.ScrollBar {}
                Basic.ScrollBar.vertical: Ui.ScrollBar {}
                delegate: Row {
                    required property var modelData
                    Repeater {
                        model: modelData.cells
                        Rectangle {
                            required property var modelData
                            required property int index
                            width: root.columnWidths[index] || Ui.Metrics.touch * 2
                            height: Ui.Metrics.standard
                            color: Ui.Theme.surfacePanel
                            border.color: Ui.Theme.borderSubtle
                            border.width: Ui.Metrics.border
                            Ui.Text {
                                anchors.fill: parent; anchors.margins: Ui.Metrics.sm
                                text: parent.modelData
                                role: Ui.Typography.SansLabel
                                verticalAlignment: Text.AlignVCenter
                                elide: Text.ElideRight
                            }
                        }
                    }
                }
            }
        }
    }
    Loader {
        Layout.fillWidth: true
        Layout.preferredHeight: Ui.Metrics.comfortable * 5
        sourceComponent: tableComponent
    }
    Ui.Text {
        Layout.fillWidth: true
        text: root.modelData.tableNotice || ""
        role: Ui.Typography.SansCaption
        wrapMode: Text.Wrap
    }
    Ui.Dialog {
        id: full
        title: "Dataframe · read-only"
        returnFocusTo: expand
        width: parent ? Math.max(0, parent.width - Ui.Metrics.xl * 2) : Ui.Metrics.dialogWidth
        height: parent ? Math.max(0, parent.height - Ui.Metrics.xl * 2) : Ui.Metrics.dialogWidth
        contentItem: ColumnLayout {
            Loader { Layout.fillWidth: true; Layout.fillHeight: true; sourceComponent: full.opened ? tableComponent : undefined }
            Ui.Text { Layout.fillWidth: true; text: root.modelData.tableNotice || ""; role: Ui.Typography.SansCaption; wrapMode: Text.Wrap }
            Ui.EditorButton { variant: Ui.EditorButton.Outlined; objectName: "dataframe-close"; text: "Close"; onClicked: full.close() }
        }
    }
}

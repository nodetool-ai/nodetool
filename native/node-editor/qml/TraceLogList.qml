pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property var rows
    property string selectedLogId: ""
    signal logSelected(string logId)
    signal spanFocused(string spanId)
    readonly property bool wide: width >= Ui.Metrics.dialogWidth
    readonly property real timeWidth: Ui.Metrics.xxxl * 3
    readonly property real levelWidth: Ui.Metrics.xxxl * 2
    readonly property real flexibleWidth: Math.max(0, width - timeWidth - levelWidth - Ui.Metrics.sm * 2 - Ui.Metrics.lg * (wide ? 4 : 2))
    readonly property real sourceWidth: wide ? flexibleWidth * 0.6 / 4.6 : 0
    readonly property real spanWidth: wide ? flexibleWidth / 4.6 : 0
    readonly property real rowHeight: Ui.Metrics.standard
    Layout.minimumWidth: 0
    spacing: Ui.Metrics.xs
    Accessible.role: Accessible.Grouping
    Accessible.name: qsTr("Stored run logs")
    RowLayout {
        Layout.fillWidth: true
        Layout.leftMargin: Ui.Metrics.sm
        Layout.rightMargin: Ui.Metrics.sm
        Layout.preferredHeight: Ui.Metrics.compact
        spacing: Ui.Metrics.lg
        Ui.Text { Layout.preferredWidth: root.timeWidth; text: qsTr("Time"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        Ui.Text { Layout.preferredWidth: root.levelWidth; text: qsTr("Level"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        Ui.Text { Layout.preferredWidth: root.sourceWidth; visible: root.wide; text: qsTr("Source"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        Ui.Text { Layout.preferredWidth: root.spanWidth; visible: root.wide; text: qsTr("Span"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
        Ui.Text { Layout.fillWidth: true; text: qsTr("Message"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
    }
    ListView {
        id: logs
        objectName: "trace-log-rows"
        Layout.fillWidth: true
        Layout.fillHeight: true
        clip: true
        model: root.rows
        activeFocusOnTab: true
        keyNavigationEnabled: true
        Basic.ScrollBar.vertical: Ui.ScrollBar {}
        Keys.onReturnPressed: if (currentIndex >= 0 && currentIndex < count) root.logSelected(root.rows[currentIndex].id)
        Keys.onEnterPressed: if (currentIndex >= 0 && currentIndex < count) root.logSelected(root.rows[currentIndex].id)
        Keys.onPressed: event => {
            if (count && (event.key === Qt.Key_Home || event.key === Qt.Key_End)) {
                currentIndex = event.key === Qt.Key_Home ? 0 : count - 1
                positionViewAtIndex(currentIndex, ListView.Contain)
                event.accepted = true
            }
        }
        delegate: Ui.EditorButton {
            id: row
            required property var modelData
            required property int index
            objectName: "trace-log-" + modelData.id
            width: logs.width
            height: root.rowHeight
            variant: Ui.EditorButton.Flat
            active: root.selectedLogId === modelData.id || (logs.activeFocus && logs.currentIndex === index)
            accessibleName: qsTr("Read log event %1, %2").arg(modelData.message).arg(modelData.id)
            description: modelData.time + ", " + modelData.level + ", " + modelData.source + ", " + modelData.spanName
            leftPadding: Ui.Metrics.sm
            rightPadding: Ui.Metrics.sm
            topPadding: Ui.Metrics.none
            bottomPadding: Ui.Metrics.none
            onClicked: { logs.currentIndex = index; root.logSelected(modelData.id) }
            contentItem: RowLayout {
                spacing: Ui.Metrics.lg
                Ui.Text { objectName: "trace-log-time-" + row.index; Layout.preferredWidth: root.timeWidth; text: row.modelData.time; textFormat: Text.PlainText; role: Ui.Typography.MonoCaption; elide: Text.ElideRight }
                Ui.Text { objectName: "trace-log-level-" + row.index; Layout.preferredWidth: root.levelWidth; text: row.modelData.level; textFormat: Text.PlainText; role: Ui.Typography.SansCaption; tone: row.modelData.levelKey === "error" ? Ui.Text.Error : row.modelData.levelKey === "warn" ? Ui.Text.Warning : Ui.Text.Secondary; elide: Text.ElideRight }
                Ui.Text { Layout.preferredWidth: root.sourceWidth; visible: root.wide; text: row.modelData.source; textFormat: Text.PlainText; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary; elide: Text.ElideRight }
                Ui.EditorButton {
                    id: spanAction
                    objectName: "trace-log-focus-" + row.modelData.id
                    Layout.preferredWidth: root.spanWidth
                    Layout.minimumWidth: 0
                    visible: root.wide
                    enabled: !!row.modelData.spanId
                    variant: Ui.EditorButton.Flat
                    text: row.modelData.spanName || row.modelData.spanId
                    accessibleName: qsTr("Filter logs to span %1").arg(row.modelData.spanId)
                    leftPadding: Ui.Metrics.none
                    rightPadding: Ui.Metrics.none
                    contentAlignment: Qt.AlignLeft
                    contentItem: Ui.Text {
                        objectName: "nativeButtonLabel"
                        text: spanAction.text
                        textFormat: Text.PlainText
                        role: Ui.Typography.SansCaption
                        tone: Ui.Text.Secondary
                        elide: Text.ElideRight
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: root.spanFocused(row.modelData.spanId)
                }
                Ui.Text { objectName: "trace-log-message-" + row.index; Layout.fillWidth: true; text: row.modelData.message; textFormat: Text.PlainText; role: Ui.Typography.SansCaption; tone: row.modelData.levelKey === "error" ? Ui.Text.Error : Ui.Text.Primary; elide: Text.ElideRight }
            }
        }
    }
}

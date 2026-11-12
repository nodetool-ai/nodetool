pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

Item {
    id: root
    required property string label
    required property var rows
    property string focusedSpanId: ""
    property real viewportHeight: implicitHeight
    signal spanFocused(string spanId)
    readonly property real rowHeight: Ui.Metrics.standard
    readonly property real statusWidth: Ui.Metrics.xxxl * 2
    readonly property real durationWidth: Ui.Metrics.xxxl * 4
    readonly property real innerWidth: Math.max(0, width - Ui.Metrics.sm * 2)
    readonly property real flexibleWidth: Math.max(0, innerWidth - statusWidth - durationWidth - Ui.Metrics.lg * 3)
    readonly property real nameWidth: flexibleWidth * 2 / 5
    readonly property real minimumLaneHeight: Ui.Metrics.compact + Math.min(rows.length, 3) * rowHeight + laneGap
    implicitHeight: Ui.Metrics.compact + rows.length * rowHeight + laneGap
    Layout.preferredHeight: Math.min(implicitHeight, Math.max(minimumLaneHeight, viewportHeight))
    readonly property real laneGap: Ui.Metrics.xs
    implicitWidth: statusWidth + durationWidth + Ui.Metrics.lg * 3 + Ui.Metrics.sm * 2 + Ui.Metrics.xxxl
    Accessible.role: Accessible.Grouping
    Accessible.name: label

    function revealFocus() {
        const index = rows.findIndex(row => row.spanId === focusedSpanId)
        if (index >= 0 && spans.count > index) {
            spans.currentIndex = index
            spans.positionViewAtIndex(index, ListView.Contain)
        }
    }
    onFocusedSpanIdChanged: revealFocus()
    onRowsChanged: revealFocus()
    ColumnLayout {
        anchors.fill: parent
        spacing: root.laneGap
        RowLayout {
            Layout.fillWidth: true
            Layout.leftMargin: Ui.Metrics.sm
            Layout.rightMargin: Ui.Metrics.sm
            Layout.preferredHeight: Ui.Metrics.compact
            spacing: Ui.Metrics.lg
            Ui.Text {
                Layout.preferredWidth: root.nameWidth
                text: root.label + " · " + root.rows.length
                role: Ui.Typography.SansLabel
                textFormat: Text.PlainText
                elide: Text.ElideRight
            }
            Ui.Text { Layout.preferredWidth: root.statusWidth; text: qsTr("Status"); role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
            Ui.Text { Layout.preferredWidth: root.durationWidth; text: qsTr("Duration"); horizontalAlignment: Text.AlignRight; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
            RowLayout {
                Layout.fillWidth: true
                spacing: Ui.Metrics.xs
                Ui.Text { text: "0"; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
                Item { Layout.fillWidth: true }
                Ui.Text { objectName: root.objectName + "-duration"; text: root.rows.length ? root.rows[0].horizon : ""; role: Ui.Typography.SansCaption; tone: Ui.Text.Secondary }
            }
        }
        ListView {
            id: spans
            objectName: root.objectName + "-rows"
            Layout.fillWidth: true
            Layout.fillHeight: true
            implicitHeight: root.rows.length * root.rowHeight
            clip: true
            activeFocusOnTab: true
            keyNavigationEnabled: true
            model: root.rows
            onCountChanged: root.revealFocus()
            Keys.onPressed: event => {
                if (count && (event.key === Qt.Key_Home || event.key === Qt.Key_End)) {
                    currentIndex = event.key === Qt.Key_Home ? 0 : count - 1
                    positionViewAtIndex(currentIndex, ListView.Contain)
                    event.accepted = true
                }
            }
            Keys.onReturnPressed: if (currentIndex >= 0 && currentIndex < root.rows.length) root.spanFocused(root.rows[currentIndex].spanId)
            Keys.onEnterPressed: if (currentIndex >= 0 && currentIndex < root.rows.length) root.spanFocused(root.rows[currentIndex].spanId)
            Basic.ScrollBar.vertical: Ui.ScrollBar {}
            delegate: Ui.EditorButton {
                id: row
                required property var modelData
                required property int index
                objectName: "trace-span-" + modelData.spanId
                readonly property bool focused: root.focusedSpanId === modelData.spanId
                width: spans.width
                height: root.rowHeight
                text: String(modelData.name || "")
                accessibleName: qsTr("Inspect span %1, %2").arg(text).arg(modelData.spanId)
                variant: Ui.EditorButton.Flat
                active: focused || (spans.activeFocus && index === spans.currentIndex)
                leftPadding: Ui.Metrics.sm
                rightPadding: Ui.Metrics.sm
                topPadding: Ui.Metrics.none
                bottomPadding: Ui.Metrics.none
                onClicked: root.spanFocused(modelData.spanId)
                contentItem: RowLayout {
                    spacing: Ui.Metrics.lg
                    Item {
                        Layout.preferredWidth: root.nameWidth
                        Layout.fillHeight: true
                        clip: true
                        Ui.Text {
                            x: Math.min(Math.min(16, Math.max(0, row.modelData.depth)) * Ui.Metrics.lg, Math.max(0, parent.width - Ui.Metrics.compact))
                            width: Math.max(0, parent.width - x)
                            height: parent.height
                            text: row.text
                            role: Ui.Typography.SansLabel
                            tone: row.modelData.status === "ERROR" ? Ui.Text.Error : Ui.Text.Primary
                            textFormat: Text.PlainText
                            elide: Text.ElideRight
                            verticalAlignment: Text.AlignVCenter
                        }
                    }
                    Ui.Text {
                        Layout.preferredWidth: root.statusWidth
                        text: row.modelData.statusLabel
                        role: Ui.Typography.SansCaption
                        tone: row.modelData.status === "ERROR" ? Ui.Text.Error : row.modelData.status === "OK" ? Ui.Text.Success : Ui.Text.Disabled
                    }
                    Ui.Text {
                        Layout.preferredWidth: root.durationWidth
                        text: row.modelData.duration
                        role: Ui.Typography.MonoCaption
                        textFormat: Text.PlainText
                        horizontalAlignment: Text.AlignRight
                        elide: Text.ElideRight
                    }
                    Rectangle {
                        id: track
                        objectName: "trace-track-" + row.modelData.spanId
                        Layout.fillWidth: true
                        Layout.preferredHeight: Ui.Metrics.sm
                        radius: Ui.Metrics.micro
                        color: Ui.Theme.actionHover
                        clip: true
                        Rectangle {
                            objectName: "trace-bar-" + row.modelData.spanId
                            x: Math.min(Math.min(100, Math.max(0, row.modelData.offset)) / 100 * track.width, Math.max(0, track.width - width))
                            width: Math.min(track.width, Math.max(Ui.Metrics.micro, Math.min(100, row.modelData.width) / 100 * track.width))
                            height: track.height
                            radius: Ui.Metrics.micro
                            color: row.modelData.status === "ERROR" ? Ui.Theme.statusError : row.modelData.status === "OK" ? Ui.Theme.accentPrimary : Ui.Theme.textDisabled
                            Accessible.role: Accessible.Graphic
                            Accessible.name: row.modelData.timeline
                        }
                    }
                }
            }
        }
    }
}

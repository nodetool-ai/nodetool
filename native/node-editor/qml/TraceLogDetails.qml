pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property var controller
    readonly property var log: controller.selectedLog
    property string previousLogId: ""
    signal askAgentRequested(string runId, string spanId)
    spacing: Ui.Metrics.md
    Layout.minimumWidth: 0
    Ui.Text {
        objectName: "trace-log-span-name"
        Layout.fillWidth: true
        role: Ui.Typography.SansLabel
        textFormat: Text.PlainText
        wrapMode: Text.WrapAnywhere
        maximumLineCount: 2
        elide: Text.ElideRight
        text: String(root.log.spanName || qsTr("Log event")).slice(0, 32000)
    }
    Ui.Text {
        Layout.fillWidth: true
        textFormat: Text.PlainText
        wrapMode: Text.WrapAnywhere
        tone: Ui.Text.Secondary
        text: root.log.meta || ""
    }
    Flow {
        Layout.fillWidth: true
        Layout.minimumWidth: 0
        spacing: Ui.Metrics.sm
        Ui.EditorButton {
            objectName: "trace-ask-log"
            text: qsTr("Ask agent")
            onClicked: root.askAgentRequested(root.controller.selectedRunId, root.log.spanId || "")
        }
        Ui.EditorButton {
            objectName: "trace-log-span"
            text: qsTr("Show log span")
            visible: !!root.log.spanId
            onClicked: root.controller.focusSpan(root.log.spanId)
        }
        Ui.EditorButton {
            objectName: "trace-close-log"
            text: qsTr("Close log")
            onClicked: root.controller.closeLog()
        }
    }
    Basic.ScrollView {
        id: viewport
        objectName: "trace-log-details-scroll"
        Layout.fillWidth: true
        Layout.fillHeight: true
        contentWidth: availableWidth
        clip: true
        ColumnLayout {
            width: viewport.availableWidth
            spacing: Ui.Metrics.md
            Ui.Text { text: qsTr("Attributes"); role: Ui.Typography.SansLabel }
            TraceAttributeList {
                Layout.fillWidth: true
                identity: "trace-log-attribute"
                rows: root.log.attributes || []
            }
        }
    }
    Connections {
        target: root.controller
        function onChanged() {
            const logId = root.log.id || ""
            if (logId !== root.previousLogId) {
                (viewport.contentItem as Flickable).contentY = 0
                root.previousLogId = logId
            }
        }
    }
}

pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls.Basic as Basic
import QtQuick.Layouts
import NodeTool.UiPrimitives as Ui

ColumnLayout {
    id: root
    required property var controller
    signal askAgentRequested(string runId, string spanId)
    readonly property var span: controller.focus
    Layout.minimumWidth: 0
    spacing: Ui.Metrics.md
    RowLayout {
        Layout.fillWidth: true
        Ui.Text { Layout.fillWidth: true; role: Ui.Typography.SansLabel; textFormat: Text.PlainText; wrapMode: Text.WrapAnywhere; maximumLineCount: 2; elide: Text.ElideRight; text: String(root.span.name || qsTr("Span")).slice(0, 32000) }
        Ui.EditorButton { objectName: "trace-clear-focus"; text: qsTr("Show whole run"); onClicked: root.controller.clearFocus() }
    }
    RowLayout {
        Layout.fillWidth: true
        Ui.EditorButton { objectName: "trace-copy"; text: root.controller.copied ? qsTr("Copied") : qsTr("Copy span JSON"); visible: !!root.span.json; onClicked: root.controller.copyFocusedSpan() }
        Ui.EditorButton { objectName: "trace-ask-span"; text: qsTr("Ask agent"); onClicked: root.askAgentRequested(root.controller.selectedRunId, root.controller.focusedSpanId) }
    }
    Basic.ScrollView {
        id: viewport
        objectName: "trace-details-scroll"
        Layout.fillWidth: true
        Layout.fillHeight: true
        contentWidth: availableWidth
        clip: true
        ColumnLayout {
            width: viewport.availableWidth
            spacing: Ui.Metrics.md
            Ui.Text { Layout.fillWidth: true; textFormat: Text.PlainText; wrapMode: Text.WrapAnywhere; text: root.controller.focusError + root.controller.focusNotices.join("\n"); visible: text.length > 0 }
            Ui.Text { text: qsTr("Loading span…"); visible: root.controller.focusLoading }
            Ui.Text { objectName: "trace-span-status"; textFormat: Text.PlainText; text: root.span.statusLabel || ""; tone: root.span.status === "ERROR" ? Ui.Text.Error : root.span.status === "OK" ? Ui.Text.Success : Ui.Text.Secondary; visible: !!root.span.spanId }
            Ui.Text { objectName: "trace-span-meta"; Layout.fillWidth: true; textFormat: Text.PlainText; wrapMode: Text.Wrap; text: root.span.meta || "" }
            Ui.Text { objectName: "trace-span-id"; Layout.fillWidth: true; role: Ui.Typography.MonoCode; textFormat: Text.PlainText; wrapMode: Text.WrapAnywhere; text: root.span.spanId || "" }
            Ui.Text { objectName: "trace-span-error"; Layout.fillWidth: true; textFormat: Text.PlainText; wrapMode: Text.WrapAnywhere; tone: Ui.Text.Error; text: String(root.span.error || "").slice(0, 32000); visible: text.length > 0 }
            Ui.Text { text: qsTr("Attributes"); role: Ui.Typography.SansLabel; visible: !!root.span.spanId }
            TraceAttributeList { Layout.fillWidth: true; identity: "trace-attribute"; rows: root.span.attributes || []; visible: !!root.span.spanId }
            Ui.Text { text: qsTr("Events (%1)").arg((root.span.events || []).length); role: Ui.Typography.SansLabel; visible: (root.span.events || []).length > 0 }
            Repeater {
                model: (root.span.events || []).slice(0, 64)
                delegate: ColumnLayout {
                    id: eventRow
                    required property var modelData
                    required property int index
                    Layout.fillWidth: true
                    spacing: Ui.Metrics.xs
                    Ui.Text { objectName: "trace-event-" + eventRow.index; Layout.fillWidth: true; textFormat: Text.PlainText; wrapMode: Text.WrapAnywhere; text: String(eventRow.modelData.label).slice(0, 32000) }
                    TraceAttributeList { Layout.fillWidth: true; identity: "trace-event-" + eventRow.index + "-attribute"; rows: eventRow.modelData.attributes }
                }
            }
            Ui.Text { Layout.fillWidth: true; wrapMode: Text.Wrap; visible: (root.span.events || []).length > 64; text: qsTr("Showing the first 64 events. Copy span JSON for the complete record.") }
        }
    }
    Connections {
        target: root.controller
        function onChanged() {
            if (root.span.spanId !== root.previousSpan) {
                (viewport.contentItem as Flickable).contentY = 0
                root.previousSpan = root.span.spanId || ""
            }
        }
    }
    property string previousSpan: ""
}
